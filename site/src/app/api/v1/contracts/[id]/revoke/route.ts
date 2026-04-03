import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey } from '@/lib/api-auth';
import { verifyMessage } from 'ethers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/revoke
 *
 * Revoke an active delegation contract. Only the principal (contract creator
 * via API key, or wallet signer) can revoke. This is the human override
 * mechanism required by EU AI Act Article 14.
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
  const isHash = /^[a-f0-9]{64}$/i.test(id);
  const isContractId = id.startsWith('amb-');

  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, api_key_id, amendment_type, payer_wallet, revoked_at');

  if (isContractId) query = query.eq('contract_id', id);
  else if (isHash) query = query.eq('sha256_hash', id);
  else query = query.eq('id', id);

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

  const { error: updateError } = await db
    .from('contracts')
    .update({
      status: 'revoked',
      revoked_at: now,
      revoked_by: revokedBy,
      revocation_reason: reason || null,
    })
    .eq('id', contract.id);

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
