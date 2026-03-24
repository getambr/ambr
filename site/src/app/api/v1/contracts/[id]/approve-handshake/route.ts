import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/v1/contracts/[id]/approve-handshake
 * Principal approves an agent-initiated handshake with wallet signature.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contractIdParam } = await params;
  const ip = getClientIp(request);
  const rl = rateLimit(`approve-hs:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
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

  const db = getSupabaseAdmin();

  // Find contract
  const isHash = /^[a-f0-9]{64}$/.test(contractIdParam);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(contractIdParam);
  const column = isHash ? 'sha256_hash' : isUuid ? 'id' : 'contract_id';

  const { data: contract } = await db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash')
    .eq(column, contractIdParam)
    .single();

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  // Find agent-initiated handshake for this wallet
  const { data: handshake } = await db
    .from('handshakes')
    .select('id, intent, source, principal_approved')
    .eq('contract_id', contract.id)
    .eq('wallet_address', wallet_address.toLowerCase())
    .eq('source', 'agent')
    .single();

  if (!handshake) {
    return NextResponse.json(
      { error: 'No agent-initiated handshake found for this wallet on this contract' },
      { status: 404 },
    );
  }

  if (handshake.principal_approved) {
    return NextResponse.json({
      ok: true,
      message: 'Handshake already approved.',
      intent: handshake.intent,
    });
  }

  // Approve
  const { error } = await db
    .from('handshakes')
    .update({
      principal_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq('id', handshake.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to approve handshake' }, { status: 500 });
  }

  logAudit({
    event_type: 'handshake_approved',
    actor: wallet_address.toLowerCase(),
    details: {
      contract_id: contract.contract_id,
      intent: handshake.intent,
      handshake_id: handshake.id,
    },
    ip_address: ip,
  });

  return NextResponse.json({
    ok: true,
    contract_id: contract.contract_id,
    intent: handshake.intent,
    principal_approved: true,
    message: 'Handshake approved. You can now proceed to sign the contract.',
    sign_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
  });
}
