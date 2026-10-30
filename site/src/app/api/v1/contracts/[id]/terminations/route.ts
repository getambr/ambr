import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';
import { getCurrentHolders } from '@/lib/chain/cnft-holders';
import { contractRefColumn, INVALID_CONTRACT_REF, type ContractRefColumn } from '@/lib/contract/lookup';
import {
  acceptanceMessageTemplate,
  bindsToTermination,
  effectiveAtFrom,
  entitle,
  noticeHoursFrom,
  resolvePartySet,
  terminationGate,
  verifySignedIntent,
  type ContractCategory,
  type TerminationGround,
} from '@/lib/termination';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/terminations  — propose ending the contract
 * GET  /api/v1/contracts/[id]/terminations  — list proposals
 *
 * The bilateral counterpart to /revoke. Delegation and power-of-attorney contracts
 * end unilaterally, because withdrawing an agent's authority cannot wait for the
 * agent to agree. Commerce and consumer contracts end only when both current parties
 * sign, because ending one of those is repudiation, not oversight.
 *
 * This route is the exit the 403 from /revoke points to. The amendment flow
 * cannot end anything, because its terminal write mints a successor, so without
 * this route commerce and consumer contracts would have no exit at all.
 *
 * All decision logic lives in @/lib/termination so it can be unit-tested; this file
 * fetches facts, calls it, and writes.
 */

const DEFAULT_EXPIRY_HOURS = 336; // 14 days
const MIN_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 2160; // 90 days

const GROUNDS: readonly TerminationGround[] = ['convenience', 'cause', 'mutual'];

/** PostgREST returns an embed as either an object or a single-element array. */
function categoryOf(row: unknown): ContractCategory {
  const join = (row as { templates?: { category?: string } | { category?: string }[] }).templates;
  const raw = Array.isArray(join) ? join[0]?.category : join?.category;
  return (raw as ContractCategory) ?? null;
}

const CONTRACT_COLUMNS =
  'id, contract_id, status, sha256_hash, api_key_id, visibility, machine_readable, ' +
  'parameters, nft_token_id, nft_counterparty_token_id, templates(category)';

function lookupQuery(
  db: ReturnType<typeof getSupabaseAdmin>,
  column: ContractRefColumn,
  id: string,
  columns: string,
) {
  return db.from('contracts').select(columns).eq(column, id);
}

/**
 * Expire this contract's stale proposals before doing anything else.
 *
 * The unique partial index is what stops concurrent proposals, and without this sweep
 * an abandoned proposal would lock the contract out of ever being terminated. There is
 * no global sweeper in this codebase (amendment `expires_at` has the same gap); this
 * closes it at the one point where staleness would actually block progress.
 */
async function sweepExpired(
  db: ReturnType<typeof getSupabaseAdmin>,
  contractId: string,
): Promise<number> {
  const { data } = await db
    .from('termination_proposals')
    .update({ status: 'expired' })
    .eq('contract_id', contractId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id, ground');

  const swept = data ?? [];
  // If a `cause` proposal is what put the contract into `disputed`, expiring it must
  // release the contract. Otherwise one abandoned assertion freezes amendments forever.
  if (swept.some((r) => (r as { ground?: string }).ground === 'cause')) {
    await db
      .from('contracts')
      .update({ status: 'active' })
      .eq('id', contractId)
      .eq('status', 'disputed');
  }
  return swept.length;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const apiCtx = await validateApiKey(request).catch(() => null);
  const ip = getClientIp(request);
  const rl = rateLimit(`terminate:${apiCtx?.keyId ?? ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const {
    wallet_address,
    signature,
    message,
    ground = 'convenience',
    reason,
    expires_in_hours,
  } = body as {
    wallet_address?: string;
    signature?: string;
    message?: string;
    ground?: string;
    reason?: string;
    expires_in_hours?: number;
  };

  if (!wallet_address || !signature || !message) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        message:
          'Ending a contract requires a wallet signature. Send wallet_address, ' +
          'signature and message. An API key alone is not sufficient: the parties to ' +
          'this contract are defined by who holds its tokens, not by who owns an account.',
      },
      { status: 401 },
    );
  }

  if (!GROUNDS.includes(ground as TerminationGround)) {
    return NextResponse.json(
      { error: 'validation_error', message: `ground must be one of: ${GROUNDS.join(', ')}` },
      { status: 400 },
    );
  }

  let expiryHours = DEFAULT_EXPIRY_HOURS;
  if (expires_in_hours !== undefined) {
    if (
      typeof expires_in_hours !== 'number' ||
      !Number.isFinite(expires_in_hours) ||
      expires_in_hours < MIN_EXPIRY_HOURS ||
      expires_in_hours > MAX_EXPIRY_HOURS
    ) {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: `expires_in_hours must be between ${MIN_EXPIRY_HOURS} and ${MAX_EXPIRY_HOURS}`,
        },
        { status: 400 },
      );
    }
    expiryHours = expires_in_hours;
  }

  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: contract, error: lookupError } = await lookupQuery(db, column, id, CONTRACT_COLUMNS).single();

  if (lookupError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Cast through unknown: the column list is a runtime string, so supabase-js cannot
  // infer a row type and falls back to GenericStringError.
  const row = contract as unknown as Record<string, unknown>;
  const category = categoryOf(contract);
  const isOwner = Boolean(apiCtx?.keyId && apiCtx.keyId === row.api_key_id);

  const gate = terminationGate({ category, status: String(row.status) });
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: gate.error,
        message: gate.message,
        contract_category: category,
        contract_status: row.status,
        ...(gate.error === 'unilateral_termination_available'
          ? { revoke_url: `/api/v1/contracts/${row.contract_id}/revoke` }
          : {}),
      },
      { status: gate.status },
    );
  }

  if (!bindsToTermination(message, String(row.sha256_hash))) {
    return NextResponse.json(
      {
        error: 'message_mismatch',
        message:
          'The signed message must contain this contract\'s SHA-256 hash and state ' +
          'termination intent, so that a signature made for something else cannot be ' +
          'replayed here.',
        required_hash: row.sha256_hash,
      },
      { status: 400 },
    );
  }

  const verified = verifySignedIntent({ walletAddress: wallet_address, signature, message });
  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error, message: verified.message },
      { status: verified.status },
    );
  }

  const holdersResult = await getCurrentHolders({
    id: String(row.id),
    nft_token_id: (row.nft_token_id as number | null) ?? null,
    nft_counterparty_token_id: (row.nft_counterparty_token_id as number | null) ?? null,
  });

  const partySet = resolvePartySet({
    currentHolders: holdersResult.currentHolders,
    fromChain: holdersResult.fromChain,
    hasTokenIds: Boolean(row.nft_token_id) || Boolean(row.nft_counterparty_token_id),
  });
  if (!partySet.ok) {
    return NextResponse.json(
      { error: partySet.error, message: partySet.message },
      { status: partySet.status },
    );
  }

  const entitled = entitle({
    decision: 'propose',
    recovered: verified.recovered,
    holders: partySet.holders,
  });
  if (!entitled.ok) {
    return NextResponse.json(
      {
        error: entitled.error,
        message: entitled.message,
        // The holder list is disclosed only to the key that owns the contract.
        // GET /amendments publishes it to anyone, which is half of how the unsigned
        // wallet strings in that flow became exploitable.
        ...(isOwner ? { current_parties: partySet.holders } : {}),
      },
      { status: entitled.status },
    );
  }

  const counterparty = partySet.holders.find((h) => h !== verified.recovered) ?? '';
  const notice = noticeHoursFrom(row.machine_readable, row.parameters);
  const createdAt = new Date();
  const effectiveAt = effectiveAtFrom(createdAt, notice.hours);
  const expiresAt = new Date(createdAt.getTime() + expiryHours * 3600_000);

  await sweepExpired(db, String(row.id));

  const { data: proposal, error: insertError } = await db
    .from('termination_proposals')
    .insert({
      contract_id: row.id,
      proposer_wallet: verified.recovered,
      proposer_signature: signature,
      proposer_message: message,
      proposer_api_key_id: apiCtx?.keyId ?? null,
      ground,
      reason: reason ?? null,
      notice_period_hours: notice.hours,
      notice_source: notice.source,
      effective_at: effectiveAt.toISOString(),
      counterparty_wallet_at_proposal: counterparty,
      holders_from_chain: holdersResult.fromChain,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      created_at: createdAt.toISOString(),
    })
    .select('id')
    .single();

  if (insertError || !proposal) {
    // 23505 is the unique partial index: one open proposal per contract.
    if ((insertError as { code?: string } | null)?.code === '23505') {
      const { data: open } = await db
        .from('termination_proposals')
        .select('id, proposer_wallet, expires_at')
        .eq('contract_id', row.id)
        .eq('status', 'pending')
        .maybeSingle();
      return NextResponse.json(
        {
          error: 'proposal_already_open',
          message:
            'A termination proposal is already open on this contract. Respond to it or ' +
            'withdraw it before proposing another.',
          proposal_id: open?.id ?? null,
          expires_at: open?.expires_at ?? null,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'storage_failed', message: 'Could not record the termination proposal.' },
      { status: 500 },
    );
  }

  // Asserting cause IS a dispute. Done AFTER the insert on purpose: if this fails, the
  // result is a valid pending proposal on an active contract — weaker, but coherent.
  let contractStatus = String(row.status);
  if (ground === 'cause' && contractStatus === 'active') {
    const { data: disputed } = await db
      .from('contracts')
      .update({ status: 'disputed' })
      .eq('id', row.id)
      .eq('status', 'active')
      .select('id');
    if (disputed && disputed.length > 0) contractStatus = 'disputed';
  }

  await db.from('audit_log').insert({
    contract_id: row.id,
    action: 'termination_proposed',
    actor: verified.recovered,
    details: {
      proposal_id: proposal.id,
      ground,
      category,
      notice_period_hours: notice.hours,
      notice_source: notice.source,
      effective_at: effectiveAt.toISOString(),
      holders_from_chain: holdersResult.fromChain,
    },
  });

  return NextResponse.json(
    {
      proposal_id: proposal.id,
      contract_id: row.contract_id,
      status: 'pending',
      ground,
      contract_status: contractStatus,
      notice_period_hours: notice.hours,
      notice_source: notice.source,
      effective_at: effectiveAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      created_at: createdAt.toISOString(),
      holders_from_chain: holdersResult.fromChain,
      acceptance_message_template: acceptanceMessageTemplate({
        contractRef: String(row.contract_id),
        contractHash: String(row.sha256_hash),
        proposalId: String(proposal.id),
        category,
        noticeHours: notice.hours,
        effectiveAt,
        now: createdAt,
      }),
      respond_url: `/api/v1/contracts/${row.contract_id}/terminations/${proposal.id}/respond`,
      ...(isOwner ? { counterparty_must_sign: counterparty } : {}),
      note:
        'Termination ends the contract going forward. It does not settle obligations ' +
        'already accrued — payment for work done, refunds, data export and any cure ' +
        'period are matters for the contract text, not for this status.',
    },
    { status: 201 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const apiCtx = await validateApiKey(request).catch(() => null);

  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }

  const { data: contract, error } = await lookupQuery(
    db,
    column,
    id,
    'id, contract_id, status, sha256_hash, api_key_id, visibility, machine_readable, parameters, templates(category)',
  ).single();

  if (error || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Cast through unknown: the column list is a runtime string, so supabase-js cannot
  // infer a row type and falls back to GenericStringError.
  const row = contract as unknown as Record<string, unknown>;
  const isOwner = Boolean(apiCtx?.keyId && apiCtx.keyId === row.api_key_id);
  const visibility = String(row.visibility ?? 'private');
  // Same rule as the status route, not the amendments route: that one publishes every
  // field to anyone, including both parties' wallet addresses.
  const isRestricted = (visibility === 'private' || visibility === 'encrypted') && !isOwner;
  const freeTextAllowed = isOwner || visibility === 'public' || visibility === 'metadata_only';

  const { data: rows } = await db
    .from('termination_proposals')
    .select('*')
    .eq('contract_id', row.id)
    .order('created_at', { ascending: false });

  const category = categoryOf(contract);
  const now = new Date();

  const proposals = (rows ?? []).map((p) => {
    const r = p as Record<string, unknown>;
    const isOpen = r.status === 'pending' && new Date(String(r.expires_at)) > now;

    const base = {
      id: r.id,
      status: r.status,
      ground: r.ground,
      notice_period_hours: r.notice_period_hours,
      notice_source: r.notice_source,
      effective_at: r.effective_at,
      expires_at: r.expires_at,
      created_at: r.created_at,
      accepted_at: r.accepted_at,
      notice_waived: r.notice_waived,
      is_open: isOpen,
      ...(isOpen
        ? {
            acceptance_message_template: acceptanceMessageTemplate({
              contractRef: String(row.contract_id),
              contractHash: String(row.sha256_hash),
              proposalId: String(r.id),
              category,
              noticeHours: Number(r.notice_period_hours ?? 0),
              effectiveAt: new Date(String(r.effective_at)),
              now,
            }),
          }
        : {}),
      ...(freeTextAllowed ? { reason: r.reason, responder_reason: r.responder_reason } : {}),
    };

    // Wallets and signed messages are party data. A restricted reader gets enough to
    // act — including the exact string to sign — and nothing that identifies anyone.
    if (isRestricted) return base;

    return {
      ...base,
      proposer_wallet: r.proposer_wallet,
      counterparty_wallet_at_proposal: r.counterparty_wallet_at_proposal,
      accepted_by_wallet: r.accepted_by_wallet,
      holders_from_chain: r.holders_from_chain,
    };
  });

  return NextResponse.json({
    contract_id: row.contract_id,
    contract_status: row.status,
    contract_category: category,
    termination_model:
      category === 'delegation' || category === 'peer'
        ? 'unilateral'
        : 'bilateral',
    count: proposals.length,
    proposals,
  });
}

export async function OPTIONS(request: Request) {
  return corsOptions(request);
}
