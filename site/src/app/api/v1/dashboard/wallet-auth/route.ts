import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyMessage } from 'ethers';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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
  const addr = wallet_address.toLowerCase();

  // Find API key associated with this wallet via tx_from (x402 payment wallet)
  const { data: apiKey } = await db
    .from('api_keys')
    .select('id, email, credits, tier, key_prefix, is_active')
    .ilike('tx_from', addr)
    .eq('is_active', true)
    .limit(1)
    .single();

  // Also check x402_payments for a wallet that paid for contracts
  let keyFromPayments: typeof apiKey = null;
  if (!apiKey) {
    const { data: payment } = await db
      .from('x402_payments')
      .select('contract_id')
      .ilike('payer_wallet', addr)
      .not('contract_id', 'is', null)
      .limit(1)
      .single();

    if (payment?.contract_id) {
      // Find the api_key_id from the contract
      const { data: contract } = await db
        .from('contracts')
        .select('api_key_id')
        .eq('id', payment.contract_id)
        .single();

      if (contract?.api_key_id) {
        const { data: key } = await db
          .from('api_keys')
          .select('id, email, credits, tier, key_prefix, is_active')
          .eq('id', contract.api_key_id)
          .eq('is_active', true)
          .single();
        keyFromPayments = key;
      }
    }
  }

  const resolvedKey = apiKey || keyFromPayments;

  // Gather all contracts associated with this wallet (via multiple paths)
  // 1. Contracts from API key
  let apiKeyContracts: Record<string, unknown>[] = [];
  if (resolvedKey) {
    const { data } = await db
      .from('contracts')
      .select('contract_id, status, amendment_type, sha256_hash, created_at, template_id, principal_declaration, nft_mint_status, nft_holder_wallet, nft_counterparty_wallet, visibility')
      .eq('api_key_id', resolvedKey.id)
      .order('created_at', { ascending: false })
      .limit(50);
    apiKeyContracts = data || [];
  }

  // 2. Contracts where wallet is a signer
  const { data: signedContracts } = await db
    .from('signatures')
    .select('contract_id')
    .ilike('signer_wallet', addr);

  // 3. Contracts where wallet did a handshake
  const { data: handshakeContracts } = await db
    .from('handshakes')
    .select('contract_id')
    .ilike('wallet_address', addr);

  // 4. Contracts where wallet is NFT holder or counterparty
  const { data: nftContracts } = await db
    .from('contracts')
    .select('id')
    .or(`nft_holder_wallet.ilike.${addr},nft_counterparty_wallet.ilike.${addr}`);

  // 5. Contracts where wallet is the payer
  const { data: payerContracts } = await db
    .from('contracts')
    .select('id')
    .ilike('payer_wallet', addr);

  // Collect all unique contract UUIDs from wallet associations
  const walletContractIds = new Set<string>();
  signedContracts?.forEach((s) => walletContractIds.add(s.contract_id));
  handshakeContracts?.forEach((h) => walletContractIds.add(h.contract_id));
  nftContracts?.forEach((c) => walletContractIds.add(c.id));
  payerContracts?.forEach((c) => walletContractIds.add(c.id));

  // Fetch full contract data for wallet-associated contracts not already in apiKeyContracts
  const apiKeyContractIds = new Set(
    apiKeyContracts.map((c) => c.contract_id as string),
  );
  const additionalIds = [...walletContractIds].filter((id) => {
    // apiKeyContracts uses contract_id (amb-xxx), walletContractIds uses uuid
    // We need to check by uuid — fetch those that aren't already included
    return !apiKeyContracts.some((c) => {
      // Match either by contract_id field or by checking if we already have it
      const contractRow = c as { id?: string };
      return contractRow.id === id;
    });
  });

  let walletOnlyContracts: Record<string, unknown>[] = [];
  if (additionalIds.length > 0) {
    const { data } = await db
      .from('contracts')
      .select('contract_id, status, amendment_type, sha256_hash, created_at, template_id, principal_declaration, nft_mint_status, nft_holder_wallet, nft_counterparty_wallet, visibility')
      .in('id', additionalIds)
      .order('created_at', { ascending: false })
      .limit(50);
    walletOnlyContracts = data || [];
  }

  // Merge: API key contracts first, then wallet-only contracts (deduplicated)
  const seenIds = new Set(apiKeyContracts.map((c) => (c as Record<string, unknown>).contract_id));
  const allContracts = [
    ...apiKeyContracts,
    ...walletOnlyContracts.filter((c) => !seenIds.has((c as Record<string, unknown>).contract_id)),
  ];

  // If no API key and no contracts found, wallet is not associated with anything
  if (!resolvedKey && allContracts.length === 0) {
    return NextResponse.json(
      { error: 'wallet_not_found', message: 'No API key or contracts associated with this wallet' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    authorized: true,
    auth_method: 'wallet',
    user: resolvedKey
      ? {
          email: resolvedKey.email,
          tier: resolvedKey.tier,
          credits: resolvedKey.credits,
          key_prefix: resolvedKey.key_prefix || 'amb_****',
        }
      : null,
    wallet: addr,
    contracts: allContracts,
  });
}

export { corsOptions as OPTIONS };
