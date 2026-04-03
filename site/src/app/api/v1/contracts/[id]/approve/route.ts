import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey } from '@/lib/api-auth';
import { verifyMessage } from 'ethers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/approve
 *
 * Principal approves a contract that exceeded the oversight threshold.
 * This is the real-time human-in-the-loop mechanism for EU AI Act Article 14.
 *
 * Auth: API key (contract creator) OR wallet signature (principal).
 * Transitions contract from 'awaiting_principal_approval' to 'draft'.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = rateLimit(`approve:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const db = getSupabaseAdmin();

  // Lookup contract
  const isHash = /^[a-f0-9]{64}$/i.test(id);
  const isContractId = id.startsWith('amb-');

  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, api_key_id, principal_approval_required, oversight_threshold_usd');

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

  if (contract.status !== 'awaiting_principal_approval') {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: `Contract status is '${contract.status}', not 'awaiting_principal_approval'. No approval needed.`,
      },
      { status: 422 },
    );
  }

  // --- Authorization ---
  let approvedBy: string;

  // Path 1: API key (contract creator)
  const apiCtx = await validateApiKey(request);
  if (apiCtx && contract.api_key_id === apiCtx.keyId) {
    approvedBy = `api_key:${apiCtx.email}`;
  }
  // Path 2: Wallet signature
  else if (body?.wallet_address && body?.signature && body?.message) {
    try {
      const recovered = verifyMessage(body.message, body.signature).toLowerCase();
      if (recovered !== body.wallet_address.toLowerCase()) {
        return NextResponse.json(
          { error: 'signature_mismatch', message: 'Signature does not match wallet address' },
          { status: 401 },
        );
      }
      approvedBy = `wallet:${recovered}`;
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
        message: 'Approval requires API key (X-API-Key header) or wallet signature (wallet_address + signature + message in body)',
      },
      { status: 401 },
    );
  }

  // --- Execute approval ---
  const now = new Date().toISOString();

  const { error: updateError } = await db
    .from('contracts')
    .update({
      status: 'draft',
      principal_approved_at: now,
      principal_approved_by: approvedBy,
    })
    .eq('id', contract.id);

  if (updateError) {
    console.error('Approval update failed:', updateError);
    return NextResponse.json(
      { error: 'db_error', message: 'Failed to approve contract' },
      { status: 500 },
    );
  }

  logAudit({
    event_type: 'principal_approval_granted',
    severity: 'info',
    actor: approvedBy,
    details: {
      contract_id: contract.contract_id,
      oversight_threshold_usd: contract.oversight_threshold_usd,
    },
    ip_address: ip,
  });

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: 'draft',
    approved_at: now,
    approved_by: approvedBy,
    oversight_threshold_usd: contract.oversight_threshold_usd,
    message: 'Principal approval granted. Contract is now in draft status and can proceed to handshake and signing.',
    next_step: 'Contract approved. Proceed to handshake or signing.',
    sign_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/sign`,
    handshake_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/handshake`,
  });
}

export { corsOptions as OPTIONS };
