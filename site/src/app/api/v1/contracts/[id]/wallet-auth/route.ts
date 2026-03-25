import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyMessage } from 'ethers';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

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

  const { wallet_address, signature, message } = body as {
    wallet_address?: string;
    signature?: string;
    message?: string;
  };

  if (!wallet_address || !signature || !message) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Required: wallet_address, signature, message' },
      { status: 400 },
    );
  }

  // Verify ECDSA signature
  let recoveredAddress: string;
  try {
    recoveredAddress = verifyMessage(message, signature);
  } catch {
    return NextResponse.json(
      { error: 'invalid_signature', message: 'Signature verification failed' },
      { status: 400 },
    );
  }

  if (recoveredAddress.toLowerCase() !== wallet_address.toLowerCase()) {
    return NextResponse.json(
      { error: 'signature_mismatch', message: 'Recovered address does not match wallet_address' },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // Lookup contract
  let query = db.from('contracts').select('*');
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

  // Check if wallet is associated with this contract
  const addr = wallet_address.toLowerCase();
  let associated = false;

  // Direct contract fields
  if (
    contract.payer_wallet?.toLowerCase() === addr ||
    contract.nft_holder_wallet?.toLowerCase() === addr ||
    contract.nft_counterparty_wallet?.toLowerCase() === addr
  ) {
    associated = true;
  }

  // Signatures
  if (!associated) {
    const { data: sig } = await db
      .from('signatures')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('signer_wallet', addr)
      .limit(1)
      .single();
    if (sig) associated = true;
  }

  // Handshakes
  if (!associated) {
    const { data: hs } = await db
      .from('handshakes')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('wallet_address', addr)
      .limit(1)
      .single();
    if (hs) associated = true;
  }

  if (!associated) {
    return NextResponse.json(
      { error: 'wallet_not_associated', message: 'This wallet is not associated with this contract' },
      { status: 403 },
    );
  }

  // Fetch signatures and handshakes for the response
  const { data: signatures } = await db
    .from('signatures')
    .select('signer_wallet, signed_at')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true });

  const { data: handshakes } = await db
    .from('handshakes')
    .select('wallet_address, intent, message, visibility_preference, created_at')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    authorized: true,
    contract: {
      id: contract.id,
      contract_id: contract.contract_id,
      status: contract.status,
      sha256_hash: contract.sha256_hash,
      human_readable: contract.human_readable,
      machine_readable: contract.machine_readable,
      principal_declaration: contract.principal_declaration,
      visibility: contract.visibility || 'private',
      amendment_type: contract.amendment_type,
      parent_contract_hash: contract.parent_contract_hash,
      nft_token_id: contract.nft_token_id,
      nft_tx_hash: contract.nft_tx_hash,
      nft_mint_status: contract.nft_mint_status,
      nft_holder_wallet: contract.nft_holder_wallet,
      nft_counterparty_wallet: contract.nft_counterparty_wallet,
      created_at: contract.created_at,
    },
    signatures: signatures ?? [],
    handshakes: handshakes ?? [],
  });
}

export { corsOptions as OPTIONS };
