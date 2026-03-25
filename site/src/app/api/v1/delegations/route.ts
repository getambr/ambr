import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';

/**
 * POST /api/v1/delegations — Register principal wallet to API key.
 * Requires API key + ECDSA signature proving wallet ownership.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`delegation:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { wallet_address, signature, message } = body as {
    wallet_address?: string;
    signature?: string;
    message?: string;
  };

  if (!wallet_address || !signature || !message) {
    return NextResponse.json(
      { error: 'Required: wallet_address, signature, message' },
      { status: 400 },
    );
  }

  // Verify ECDSA signature
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (recovered !== wallet_address.toLowerCase()) {
    return NextResponse.json(
      { error: 'Signature does not match wallet address' },
      { status: 403 },
    );
  }

  // Verify message contains the API key prefix (prevents replay with unrelated signatures)
  if (!message.includes(apiCtx.keyId.slice(0, 8)) && !message.includes('Ambr delegation')) {
    return NextResponse.json(
      { error: 'Message must reference this API key or contain "Ambr delegation"' },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  const { error } = await db
    .from('api_keys')
    .update({
      principal_wallet: wallet_address.toLowerCase(),
      delegation_registered_at: new Date().toISOString(),
    })
    .eq('id', apiCtx.keyId);

  if (error) {
    return NextResponse.json({ error: 'Failed to register delegation' }, { status: 500 });
  }

  logAudit({
    event_type: 'delegation_registered',
    actor: wallet_address.toLowerCase(),
    details: { api_key_id: apiCtx.keyId, email: apiCtx.email },
    ip_address: ip,
  });

  return NextResponse.json({
    ok: true,
    principal_wallet: wallet_address.toLowerCase(),
    delegation_scope: apiCtx.delegationScope || { actions: ['create', 'handshake', 'read'] },
    message: 'Delegation registered. Your agent can now act on your behalf.',
  });
}

/**
 * GET /api/v1/delegations — Get delegation for current API key.
 */
export async function GET(request: Request) {
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  return NextResponse.json({
    principal_wallet: apiCtx.principalWallet,
    delegation_scope: apiCtx.delegationScope,
    has_delegation: !!apiCtx.principalWallet,
  });
}

/**
 * DELETE /api/v1/delegations — Revoke delegation.
 */
export async function DELETE(request: Request) {
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  await db
    .from('api_keys')
    .update({
      principal_wallet: null,
      delegation_scope: null,
      delegation_registered_at: null,
    })
    .eq('id', apiCtx.keyId);

  logAudit({
    event_type: 'delegation_revoked',
    actor: apiCtx.principalWallet || apiCtx.email,
    details: { api_key_id: apiCtx.keyId },
  });

  return NextResponse.json({ ok: true, message: 'Delegation revoked.' });
}

export { corsOptions as OPTIONS };
