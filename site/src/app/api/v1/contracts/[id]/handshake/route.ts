import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/v1/contracts/[id]/handshake
 *
 * Signal intent to sign (or reject/request changes) before cryptographic commitment.
 * No API key or wallet signature required — this is a lightweight intent signal.
 * The actual wallet ownership is proven at signing time.
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

  const { wallet_address, intent, message } = body as {
    wallet_address?: string;
    intent?: string;
    message?: string;
  };

  if (!wallet_address || !intent) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Required: wallet_address, intent (accept|reject|request_changes)' },
      { status: 400 },
    );
  }

  if (!['accept', 'reject', 'request_changes'].includes(intent)) {
    return NextResponse.json(
      { error: 'validation_error', message: 'intent must be one of: accept, reject, request_changes' },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // Lookup contract
  let query = db.from('contracts').select('id, contract_id, status');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

  const { data: contract, error: contractError } = await query.single();

  if (contractError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Only draft or handshake contracts can receive handshakes
  if (!['draft', 'handshake'].includes(contract.status)) {
    return NextResponse.json(
      { error: 'invalid_status', message: `Cannot handshake a contract in '${contract.status}' status. Must be 'draft' or 'handshake'.` },
      { status: 409 },
    );
  }

  // Upsert handshake (one per wallet per contract)
  const { error: hsError } = await db
    .from('handshakes')
    .upsert(
      {
        contract_id: contract.id,
        wallet_address: wallet_address.toLowerCase(),
        intent,
        message: message || null,
      },
      { onConflict: 'contract_id,wallet_address' },
    );

  if (hsError) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to store handshake' },
      { status: 500 },
    );
  }

  // Transition to 'handshake' status if first accept and currently draft
  if (intent === 'accept' && contract.status === 'draft') {
    await db
      .from('contracts')
      .update({ status: 'handshake' })
      .eq('id', contract.id);
  }

  // Audit log
  await db.from('audit_log').insert({
    contract_id: contract.id,
    action: 'handshake',
    actor: wallet_address.toLowerCase(),
    details: { intent, message: message || null },
  });

  // Get all handshakes for this contract
  const { data: allHandshakes } = await db
    .from('handshakes')
    .select('wallet_address, intent, message, created_at')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    contract_id: contract.contract_id,
    your_intent: intent,
    status: intent === 'accept' && contract.status === 'draft' ? 'handshake' : contract.status,
    handshakes: allHandshakes ?? [],
    next_step: intent === 'accept'
      ? 'Intent recorded. Once all parties accept, proceed to signing via POST /api/v1/contracts/[id]/sign'
      : intent === 'reject'
        ? 'Contract rejected. The creator may renegotiate terms.'
        : 'Changes requested. The creator should review your message and update the contract.',
  });
}

/**
 * GET /api/v1/contracts/[id]/handshake
 *
 * List all handshake intents for a contract.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  // Lookup contract
  let query = db.from('contracts').select('id, contract_id, status');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

  const { data: contract, error: contractError } = await query.single();

  if (contractError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  const { data: handshakes } = await db
    .from('handshakes')
    .select('wallet_address, intent, message, created_at')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: contract.status,
    handshakes: handshakes ?? [],
  });
}
