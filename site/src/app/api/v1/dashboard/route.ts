import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();
  const selectCols =
    'contract_id, status, amendment_type, sha256_hash, created_at, updated_at, ' +
    'template_id, principal_declaration, nft_mint_status, nft_token_id, ' +
    'nft_counterparty_token_id, nft_holder_wallet, nft_counterparty_wallet, ' +
    'visibility, contract_type, payment_method, revoked_at, revoked_by, ' +
    'revocation_reason, expiry_date, parent_contract_hash, ' +
    'oversight_threshold_usd, principal_approval_required';

  // Fetch contracts: owned by this API key OR where user's wallet is a
  // current holder/counterparty. This handles the novation gap — if a cNFT
  // was transferred via bilateral approveTransfer(), the new holder's wallet
  // shows up in nft_holder_wallet or nft_counterparty_wallet and they can
  // now see the contract even if they created it under a different API key.
  const wallet = auth.principalWallet?.toLowerCase() ?? null;

  let contractsQuery;
  if (wallet) {
    contractsQuery = db
      .from('contracts')
      .select(selectCols)
      .or(
        `api_key_id.eq.${auth.keyId},` +
        `nft_holder_wallet.ilike.${wallet},` +
        `nft_counterparty_wallet.ilike.${wallet}`
      )
      .order('created_at', { ascending: false })
      .limit(50);
  } else {
    contractsQuery = db
      .from('contracts')
      .select(selectCols)
      .eq('api_key_id', auth.keyId)
      .order('created_at', { ascending: false })
      .limit(50);
  }

  const { data: contracts } = await contractsQuery;

  return NextResponse.json({
    user: {
      email: auth.email,
      tier: auth.tier,
      credits: auth.credits,
      key_prefix: 'amb_****',
    },
    wallet: wallet,
    contracts: contracts || [],
  });
}

export { corsOptions as OPTIONS };
