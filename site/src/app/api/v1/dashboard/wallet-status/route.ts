import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/v1/dashboard/wallet-status?wallet=0x...
 *
 * Lightweight endpoint returning NFT count, pending actions, and ZK identity
 * status for the wallet status bar. No auth required — returns only aggregate
 * counts, no contract details.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase();

  if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  const [mintedResult, pendingResult, zkResult] = await Promise.all([
    // Count minted NFTs where this wallet is holder or counterparty
    db
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('nft_mint_status', 'minted')
      .or(`nft_holder_wallet.eq.${wallet},nft_counterparty_wallet.eq.${wallet}`),

    // Count pending mints
    db
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('nft_mint_status', 'pending')
      .or(`nft_holder_wallet.eq.${wallet},nft_counterparty_wallet.eq.${wallet}`),

    // Check ZK identity attestation
    db
      .from('identity_attestations')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_address', wallet)
      .eq('verified', true),
  ]);

  return NextResponse.json(
    {
      nft_count: mintedResult.count ?? 0,
      pending_actions: pendingResult.count ?? 0,
      has_zk_identity: (zkResult.count ?? 0) > 0,
      chain: 'base',
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30',
      },
    },
  );
}
