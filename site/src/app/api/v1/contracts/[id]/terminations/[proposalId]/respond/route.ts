import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { validateApiKey } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';
import { getCurrentHolders } from '@/lib/chain/cnft-holders';
import {
  acceptanceMessageTemplate,
  bindsToTermination,
  entitle,
  noticeAcceptance,
  resolvePartySet,
  verifySignedIntent,
  type ContractCategory,
  type TerminationDecision,
} from '@/lib/termination';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/terminations/[proposalId]/respond
 *
 * accept | decline | withdraw, in one route file.
 *
 * One file for all three decisions is deliberate: in the amendment family the
 * same condition gets different status codes in different siblings (409 in
 * amend, 422 in approve, unchecked in reject) because three files each decide
 * independently. With one emitter that cannot drift.
 */

const DECISIONS: readonly TerminationDecision[] = ['accept', 'decline', 'withdraw'];

function categoryOf(row: unknown): ContractCategory {
  const join = (row as { templates?: { category?: string } | { category?: string }[] }).templates;
  const raw = Array.isArray(join) ? join[0]?.category : join?.category;
  return (raw as ContractCategory) ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> },
) {
  const { id, proposalId } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const apiCtx = await validateApiKey(request).catch(() => null);
  const ip = getClientIp(request);
  const rl = rateLimit(`terminate-respond:${apiCtx?.keyId ?? ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const { decision, wallet_address, signature, message, reason } = body as {
    decision?: string;
    wallet_address?: string;
    signature?: string;
    message?: string;
    reason?: string;
  };

  if (!DECISIONS.includes(decision as TerminationDecision)) {
    return NextResponse.json(
      { error: 'validation_error', message: `decision must be one of: ${DECISIONS.join(', ')}` },
      { status: 400 },
    );
  }
  const act = decision as TerminationDecision;

  if (!wallet_address || !signature || !message) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        message:
          'Responding to a termination requires a wallet signature. Send ' +
          'wallet_address, signature and message.',
      },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();

  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }
  let q = db
    .from('contracts')
    .select(
      'id, contract_id, status, sha256_hash, api_key_id, nft_token_id, nft_counterparty_token_id, templates(category)',
    );
  q = q.eq(column, id);

  const { data: contract, error: lookupError } = await q.single();
  if (lookupError || !contract) {
    return NextResponse.json({ error: 'not_found', message: 'Contract not found' }, { status: 404 });
  }
  const row = contract as Record<string, unknown>;
  const category = categoryOf(contract);

  const { data: proposalRow, error: proposalError } = await db
    .from('termination_proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('contract_id', row.id)
    .maybeSingle();

  if (proposalError || !proposalRow) {
    return NextResponse.json(
      { error: 'not_found', message: 'Termination proposal not found on this contract' },
      { status: 404 },
    );
  }
  const proposal = proposalRow as Record<string, unknown>;

  if (proposal.status !== 'pending') {
    return NextResponse.json(
      {
        error: 'invalid_state',
        message: `This proposal is ${proposal.status}, so it can no longer be responded to.`,
        proposal_status: proposal.status,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  if (new Date(String(proposal.expires_at)) <= now) {
    await db.from('termination_proposals').update({ status: 'expired' }).eq('id', proposalId).eq('status', 'pending');
    if (proposal.ground === 'cause') {
      await db.from('contracts').update({ status: 'active' }).eq('id', row.id).eq('status', 'disputed');
    }
    return NextResponse.json(
      { error: 'expired', message: 'This proposal expired before it was answered.', expires_at: proposal.expires_at },
      { status: 409 },
    );
  }

  if (!bindsToTermination(message, String(row.sha256_hash), { proposalId, decision: act })) {
    return NextResponse.json(
      {
        error: 'message_mismatch',
        message:
          `The signed message must contain this contract's SHA-256 hash, this proposal's ` +
          `id, and wording specific to "${act}". Each decision needs its own verb so that ` +
          `a signature made for one outcome cannot be submitted as another.`,
        required_hash: row.sha256_hash,
        required_proposal_id: proposalId,
      },
      { status: 400 },
    );
  }

  const verified = verifySignedIntent({ walletAddress: wallet_address, signature, message });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error, message: verified.message }, { status: verified.status });
  }

  // Withdrawing your own proposal never needs the holder set. Requiring it would let a
  // chain outage trap a proposer with a live proposal they no longer want to stand behind.
  let holders: string[] = [];
  if (act !== 'withdraw') {
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
      return NextResponse.json({ error: partySet.error, message: partySet.message }, { status: partySet.status });
    }
    holders = partySet.holders;
  }

  const entitled = entitle({
    decision: act,
    recovered: verified.recovered,
    holders,
    proposerWallet: String(proposal.proposer_wallet),
  });
  if (!entitled.ok) {
    return NextResponse.json({ error: entitled.error, message: entitled.message }, { status: entitled.status });
  }

  /* ---------------------------- decline / withdraw --------------------------- */

  if (act === 'decline' || act === 'withdraw') {
    const nextStatus = act === 'decline' ? 'declined' : 'withdrawn';
    const { data: updated } = await db
      .from('termination_proposals')
      .update({ status: nextStatus, responder_reason: reason ?? null })
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('id');

    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'invalid_state', message: 'This proposal was answered by someone else first.' },
        { status: 409 },
      );
    }

    // Releasing the contract matters as much as recording the answer: a `cause`
    // proposal put it into `disputed`, and a disputed contract cannot be amended.
    let contractStatus = String(row.status);
    if (proposal.ground === 'cause') {
      const { data: released } = await db
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', row.id)
        .eq('status', 'disputed')
        .select('id');
      if (released && released.length > 0) contractStatus = 'active';
    }

    await db.from('audit_log').insert({
      contract_id: row.id,
      action: act === 'decline' ? 'termination_declined' : 'termination_withdrawn',
      actor: verified.recovered,
      details: { proposal_id: proposalId, ground: proposal.ground, contract_status: contractStatus },
    });

    return NextResponse.json({
      decision: act,
      proposal_id: proposalId,
      contract_id: row.contract_id,
      proposal_status: nextStatus,
      contract_status: contractStatus,
    });
  }

  /* --------------------------------- accept --------------------------------- */

  const noticeHours = Number(proposal.notice_period_hours ?? 0);
  const effectiveAt = new Date(String(proposal.effective_at));

  const noticeCheck = noticeAcceptance({
    category,
    noticeHours,
    effectiveAt,
    now,
    message,
  });
  if (!noticeCheck.ok) {
    return NextResponse.json(
      {
        error: noticeCheck.error,
        message: noticeCheck.message,
        effective_at: effectiveAt.toISOString(),
        notice_period_hours: noticeHours,
        acceptance_message_template: acceptanceMessageTemplate({
          contractRef: String(row.contract_id),
          contractHash: String(row.sha256_hash),
          proposalId,
          category,
          noticeHours,
          effectiveAt,
          now,
        }),
      },
      { status: noticeCheck.status },
    );
  }

  const terminatedBy = `mutual:${proposal.proposer_wallet}+${verified.recovered}`;

  const { data: terminatedAt, error: rpcError } = await db.rpc('accept_termination', {
    p_proposal_id: proposalId,
    p_contract_id: row.id,
    p_acceptor: verified.recovered,
    p_signature: signature,
    p_message: message,
    p_terminated_by: terminatedBy,
    p_notice_waived: noticeCheck.waived,
  });

  if (rpcError) {
    const text = String(rpcError.message ?? '');
    if (text.includes('proposal_not_pending')) {
      return NextResponse.json(
        { error: 'invalid_state', message: 'This proposal was answered by someone else first.' },
        { status: 409 },
      );
    }
    if (text.includes('contract_state_changed')) {
      return NextResponse.json(
        {
          error: 'contract_state_changed',
          message:
            'The contract left the active or disputed state between this proposal and ' +
            'your acceptance, so it was not terminated.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: 'record_incomplete',
        message: 'The termination could not be recorded. Nothing was changed.',
        contract_id: row.contract_id,
      },
      { status: 500 },
    );
  }

  // Deliberately NO cascade. /revoke cascades to child contracts because
  // withdrawing a mandate must withdraw everything derived from it. Terminating a
  // commerce contract must not silently end separate agreements whose own parties
  // never agreed to anything. What survives is reported instead.
  const { data: children } = await db
    .from('contracts')
    .select('contract_id, status')
    .eq('parent_contract_hash', row.sha256_hash)
    .eq('status', 'active');

  await db.from('audit_log').insert({
    contract_id: row.id,
    action: 'termination_accepted',
    actor: verified.recovered,
    details: {
      proposal_id: proposalId,
      proposer: proposal.proposer_wallet,
      ground: proposal.ground,
      category,
      notice_period_hours: noticeHours,
      notice_waived: noticeCheck.waived,
      terminated_by: terminatedBy,
    },
  });

  return NextResponse.json({
    decision: 'accept',
    proposal_id: proposalId,
    contract_id: row.contract_id,
    status: 'terminated',
    terminated_at: terminatedAt,
    terminated_by: terminatedBy,
    notice_period_hours: noticeHours,
    effective_at: effectiveAt.toISOString(),
    notice_waived: noticeCheck.waived,
    active_children: (children ?? []).map((c) => (c as { contract_id: string }).contract_id),
    note:
      'The contract is ended going forward. This does not settle obligations already ' +
      'accrued — payment for completed work, refunds, data export and any cure period ' +
      'are governed by the contract text, not by this status. Child contracts are not ' +
      'terminated by this action; any listed above remain active.',
  });
}

export async function OPTIONS(request: Request) {
  return corsOptions(request);
}
