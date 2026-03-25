import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyMessage } from 'ethers';
import { mintContractNFTAsync } from '@/lib/chain/cnft-mint';
import { getMetadataUri } from '@/lib/chain/cnft-metadata';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/sign
 *
 * Sign a contract with an ECDSA wallet signature.
 * Stores the signature and transitions contract status.
 * No API key required — signature itself is proof of identity.
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

  let query = db.from('contracts').select('id, contract_id, status, sha256_hash, visibility');
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

  if (!message.includes(contract.sha256_hash)) {
    return NextResponse.json(
      { error: 'hash_mismatch', message: 'Signed message must contain the contract SHA-256 hash' },
      { status: 400 },
    );
  }

  const { data: existing } = await db
    .from('signatures')
    .select('id')
    .eq('contract_id', contract.id)
    .eq('signer_wallet', wallet_address.toLowerCase())
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'duplicate_signature', message: 'This wallet has already signed this contract' },
      { status: 409 },
    );
  }

  const { error: sigError } = await db.from('signatures').insert({
    contract_id: contract.id,
    signer_wallet: wallet_address.toLowerCase(),
    signature,
    message_hash: contract.sha256_hash,
  });

  if (sigError) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to store signature' },
      { status: 500 },
    );
  }

  let newStatus = contract.status;
  if (contract.status === 'draft' || contract.status === 'handshake') {
    newStatus = 'pending_signature';
  } else if (contract.status === 'pending_signature') {
    // Check visibility agreement before activating
    const { data: acceptHandshakes } = await db
      .from('handshakes')
      .select('wallet_address, visibility_preference')
      .eq('contract_id', contract.id)
      .eq('intent', 'accept')
      .not('visibility_preference', 'is', null);

    const contractVisibility = contract.visibility || 'private';
    const mismatch = (acceptHandshakes ?? []).find(
      (h) => h.visibility_preference !== contractVisibility,
    );

    if (mismatch) {
      return NextResponse.json(
        {
          error: 'visibility_mismatch',
          message: `Cannot activate: visibility mismatch. Contract is '${contractVisibility}' but ${mismatch.wallet_address} prefers '${mismatch.visibility_preference}'. Resolve via handshake before signing.`,
        },
        { status: 409 },
      );
    }

    newStatus = 'active';
  }

  if (newStatus !== contract.status) {
    await db
      .from('contracts')
      .update({ status: newStatus })
      .eq('id', contract.id);
  }

  let nftMintTriggered = false;
  if (newStatus === 'active') {
    mintContractNFTAsync(contract.id).catch((err) =>
      console.error('cNFT mint fire-and-forget error:', err),
    );
    nftMintTriggered = true;
  }

  await db.from('audit_log').insert({
    contract_id: contract.id,
    action: 'signed',
    actor: wallet_address.toLowerCase(),
    details: { signature_prefix: signature.slice(0, 20), new_status: newStatus },
  });

  return NextResponse.json({
    contract_id: contract.contract_id,
    signer: wallet_address.toLowerCase(),
    status: newStatus,
    message: `Contract signed successfully${newStatus !== contract.status ? `. Status: ${contract.status} → ${newStatus}` : ''}`,
    ...(nftMintTriggered && {
      nft_mint_status: 'pending',
      nft_metadata_url: getMetadataUri(contract.sha256_hash),
    }),
  });
}

export { corsOptions as OPTIONS };
