import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { validateApiKey } from '@/lib/api-auth';
import { verifyMessage } from 'ethers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/revoke
 *
 * Revoke an active delegation contract. Authorized callers: the contract
 * creator (API key) or any wallet that is a party to the contract (a signer
 * or the payer wallet) — i.e. either party may unilaterally withdraw; the
 * record of who revoked is preserved in revoked_by. Human-override mechanism
 * structured with reference to EU AI Act Art. 14 (human oversight); the
 * revocation record also feeds the Art. 12-style queryable log.
 *
 * Revocation is immediate and irreversible. All child contracts in the
 * delegation chain are also marked as revoked (cascade).
 */

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

  // Rate limit
  const ip = getClientIp(request);
  const rl = rateLimit(`revoke:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const { reason, wallet_address, signature, message } = body as {
    reason?: string;
    wallet_address?: string;
    signature?: string;
    message?: string;
  };

  const db = getSupabaseAdmin();

  // Lookup contract (by contract_id, hash, or UUID)
  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }

  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, api_key_id, amendment_type, payer_wallet, revoked_at, templates(category)');

  query = query.eq(column, id);

  const { data: contract, error: lookupError } = await query.single();

  if (lookupError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Already revoked
  if (contract.revoked_at) {
    return NextResponse.json(
      { error: 'already_revoked', message: 'Contract was already revoked', revoked_at: contract.revoked_at },
      { status: 409 },
    );
  }

  // ── Which family is this? ────────────────────────────────────────────────
  //
  // Revocation here is unilateral: any wallet that signed, the payer wallet,
  // or the creating API key can end the contract alone, with no consent step and
  // no notification to the other side. For a DELEGATION that is correct and is
  // the point — revoking your agent's authority must not require the agent's
  // permission, which is what EU AI Act Art. 14 human oversight means. Same for
  // a P2 power of attorney, which is unilateral by definition and says so.
  //
  // For COMMERCE and CONSUMER contracts it is not revocation at all, it is
  // repudiation. And it contradicts the document Ambr itself generated: C3
  // promises a cure period and payment for completed work, C1 promises notice
  // and a data-export window, A2 promises 30 days and a prorated refund, part of
  // which is statutory. Every contract carries a primacy clause making that
  // human-readable text controlling, so unilateral revocation would override
  // the terms Ambr itself wrote.
  //
  // The discriminator is templates.category, seeded delegation / commerce /
  // consumer / peer. This route reads it to decide whether unilateral
  // revocation is allowed.
  const templateJoin = (contract as { templates?: { category?: string } | { category?: string }[] }).templates;
  const category = Array.isArray(templateJoin) ? templateJoin[0]?.category : templateJoin?.category;
  const unilateralAllowed = category === 'delegation' || category === 'peer';

  if (!unilateralAllowed) {
    return NextResponse.json(
      {
        error: 'termination_requires_agreement',
        message:
          `This is a ${category ?? 'non-delegation'} contract, so it cannot be ended by one party alone. ` +
          'Its own terms set out how it ends — notice periods, cure periods, settlement of work already ' +
          'done — and this endpoint honours none of them. Propose termination instead, which requires ' +
          'the counterparty to sign: POST /api/v1/contracts/{id}/terminations, then the counterparty ' +
          'responds. Unilateral revocation remains available for delegation and power-of-attorney ' +
          'contracts, where a principal withdrawing an agent\'s authority is the intended behaviour.',
        contract_category: category ?? null,
        // Point at /terminations, not /amend: the amendment flow's only terminal
        // write is status='amended', which mints a SUCCESSOR contract, so /amend
        // is a dead end for commerce and consumer contracts. /terminations is
        // their path to an ended state.
        terminations_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/terminations`,
        amend_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/amend`,
      },
      { status: 403 },
    );
  }

  // Only active or handshake contracts can be revoked
  if (!['active', 'handshake', 'pending_signature'].includes(contract.status)) {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: `Cannot revoke a contract with status '${contract.status}'. Only active, handshake, or pending_signature contracts can be revoked.`,
      },
      { status: 422 },
    );
  }

  // --- Authorization: API key (contract creator) OR wallet signature ---
  let revokedBy: string;

  // Path 1: API key auth (principal/creator)
  const apiCtx = await validateApiKey(request);
  if (apiCtx && contract.api_key_id === apiCtx.keyId) {
    revokedBy = `api_key:${apiCtx.email}`;
  }
  // Path 2: Wallet signature (principal wallet or payer)
  else if (wallet_address && signature && message) {
    try {
      // The signed message must be scoped to THIS revocation: it has to name
      // the contract hash and state revocation intent. Without this, any
      // previously harvested (message, signature) pair from an associated
      // wallet — e.g. a login signature — could be replayed into an
      // irreversible, cascading revocation.
      if (!message.includes(contract.sha256_hash) || !/revok/i.test(message)) {
        return NextResponse.json(
          {
            error: 'message_mismatch',
            message:
              'Signed message must state revocation intent and contain the contract SHA-256 hash, e.g. "I revoke Ambr contract <id> with hash <sha256>".',
          },
          { status: 400 },
        );
      }

      const recovered = verifyMessage(message, signature).toLowerCase();
      if (recovered !== wallet_address.toLowerCase()) {
        return NextResponse.json(
          { error: 'signature_mismatch', message: 'Signature does not match wallet address' },
          { status: 401 },
        );
      }

      // Verify this wallet is associated with the contract
      const { data: sigs } = await db
        .from('signatures')
        .select('id')
        .eq('contract_id', contract.id)
        .eq('signer_wallet', recovered)
        .limit(1);

      const isAssociated =
        contract.payer_wallet === recovered ||
        (sigs && sigs.length > 0);

      if (!isAssociated) {
        return NextResponse.json(
          { error: 'unauthorized', message: 'Wallet is not associated with this contract' },
          { status: 403 },
        );
      }

      revokedBy = `wallet:${recovered}`;
    } catch {
      return NextResponse.json(
        { error: 'invalid_signature', message: 'Failed to verify wallet signature' },
        { status: 401 },
      );
    }
  } else {
    return NextResponse.json(
      {
        error: 'unauthorized',
        message: 'Revocation requires API key auth (X-API-Key header) or wallet signature (wallet_address + signature + message in body)',
      },
      { status: 401 },
    );
  }

  // --- Execute revocation ---
  const now = new Date().toISOString();

  // .is('revoked_at', null) makes the write race-safe: two concurrent revoke
  // requests can both pass the read-time check above, and the second would
  // otherwise overwrite the immutable revocation audit fields.
  const { error: updateError } = await db
    .from('contracts')
    .update({
      status: 'revoked',
      revoked_at: now,
      revoked_by: revokedBy,
      revocation_reason: reason || null,
    })
    .eq('id', contract.id)
    .is('revoked_at', null);

  if (updateError) {
    console.error('Revocation update failed:', updateError);
    return NextResponse.json(
      { error: 'db_error', message: 'Failed to revoke contract' },
      { status: 500 },
    );
  }

  // --- Cascade: revoke child contracts in delegation chain ---
  const { data: children } = await db
    .from('contracts')
    .select('id, contract_id, status')
    .eq('parent_contract_hash', contract.sha256_hash)
    .in('status', ['active', 'handshake', 'pending_signature']);

  let cascadeCount = 0;
  if (children && children.length > 0) {
    const { error: cascadeError } = await db
      .from('contracts')
      .update({
        status: 'revoked',
        revoked_at: now,
        revoked_by: `cascade:${contract.contract_id}`,
        revocation_reason: `Parent contract ${contract.contract_id} was revoked`,
      })
      .eq('parent_contract_hash', contract.sha256_hash)
      .in('status', ['active', 'handshake', 'pending_signature']);

    if (!cascadeError) cascadeCount = children.length;
  }

  logAudit({
    event_type: 'contract_revoked',
    severity: 'warn',
    actor: revokedBy,
    details: {
      contract_id: contract.contract_id,
      reason: reason || 'No reason provided',
      cascade_count: cascadeCount,
    },
    ip_address: ip,
  });

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: 'revoked',
    revoked_at: now,
    revoked_by: revokedBy,
    reason: reason || null,
    cascade: {
      children_revoked: cascadeCount,
      contracts: children?.map((c) => c.contract_id) || [],
    },
    message: 'Contract revoked successfully. This action is irreversible.',
  });
}

export { corsOptions as OPTIONS };
