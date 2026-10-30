import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { validateApiKey } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';
import { resolveApprovalCredential } from '@/lib/approval-auth';

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
  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }

  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, api_key_id, principal_approval_required, oversight_threshold_usd, principal_wallet, principal_declaration');

  query = query.eq(column, id);

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
  // The decision, and the reasoning behind it, live in lib/approval-auth.ts
  // alongside their regression tests. This block only gathers the facts.
  const apiCtx = await validateApiKey(request);

  // Wallets proven to belong to the account that owns this contract. This is the
  // entitled set; contracts.principal_wallet alone is not safe to trust, because
  // contract-engine falls back to the AGENT's address when populating it.
  const { data: boundWallets } = contract.api_key_id
    ? await db
        .from('account_wallets')
        .select('wallet_address')
        .eq('api_key_id', contract.api_key_id)
    : { data: [] as { wallet_address: string }[] };

  const declaration = (contract.principal_declaration ?? {}) as { agent_id?: string };

  const decision = resolveApprovalCredential(
    {
      contractHash: contract.sha256_hash,
      contractApiKeyId: contract.api_key_id,
      caller: apiCtx ? { keyId: apiCtx.keyId, email: apiCtx.email } : null,
      signed:
        body?.wallet_address && body?.signature && body?.message
          ? {
              walletAddress: String(body.wallet_address),
              signature: String(body.signature),
              message: String(body.message),
            }
          : null,
    },
    {
      accountWallets: (boundWallets ?? []).map((w) => w.wallet_address),
      contractPrincipalWallet: contract.principal_wallet ?? null,
      agentWallet: declaration.agent_id ?? null,
      callerDelegatedWallet: apiCtx?.principalWallet ?? null,
    },
  );

  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.error, message: decision.message },
      { status: decision.status },
    );
  }

  const approvedBy = decision.actor;

  // --- Execute approval ---
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await db
    .from('contracts')
    .update({
      status: 'draft',
      principal_approved_at: now,
      principal_approved_by: approvedBy,
    })
    .eq('id', contract.id)
    // Without this predicate a concurrent approval silently overwrites the
    // first one's attribution. Matching zero rows is how that race surfaces.
    .eq('status', 'awaiting_principal_approval')
    .select('id');

  if (updateError) {
    console.error('Approval update failed:', updateError);
    return NextResponse.json(
      { error: 'db_error', message: 'Failed to approve contract' },
      { status: 500 },
    );
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: 'Contract is no longer awaiting approval; it may have been approved concurrently.',
      },
      { status: 409 },
    );
  }

  // Awaited deliberately: unawaited, roughly one insert in three lands after
  // the serverless response and is delayed or dropped (see lib/audit.ts). An
  // Article 14 approval that is not durably recorded did not happen.
  await logAudit({
    event_type: 'principal_approval_granted',
    severity: 'info',
    actor: approvedBy,
    details: {
      contract_id: contract.contract_id,
      oversight_threshold_usd: contract.oversight_threshold_usd,
      assurance: decision.assurance,
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
