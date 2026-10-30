/**
 * POST /api/v1/admin/cnft-retry
 *
 * Admin-only. Retries the cNFT mint for a contract whose `nft_mint_status` is
 * stuck at `pending` or `failed`. Use this to recover contracts where Vercel
 * killed the original fire-and-forget mint before Base mainnet finalization.
 *
 * Synchronous mint — exports `maxDuration = 120` so the function has time to
 * await the on-chain receipt. Returns the populated nft_token_id / nft_tx_hash
 * (or a clear error message) so the operator knows whether it landed.
 *
 * Body: { contract_id: string }  // human-readable e.g. "amb-2026-0027"
 *
 * Origin: amb-2026-0027 deployed 2026-05-19, signed twice, status flipped to
 * `active` but the fire-and-forget `mintContractNFTAsync` got terminated by
 * Vercel's function teardown ~10s after the sign HTTP response, leaving the
 * mint at `pending`. Forward fix is in sign/route.ts (await + maxDuration);
 * this route is the recovery path for any contract already stuck.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mintContractNFTAsync } from '@/lib/chain/cnft-mint';
import { corsOptions } from '@/lib/cors';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  contract_id: z.string().min(1).max(50),
});

export async function POST(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Admin access required.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { contract_id } = parsed.data;
  const db = getSupabaseAdmin();

  // Look up the internal UUID + current state
  const { data: contract, error: lookupErr } = await db
    .from('contracts')
    .select('id, contract_id, status, nft_mint_status, nft_token_id, nft_tx_hash')
    .eq('contract_id', contract_id)
    .single();

  if (lookupErr || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: `Contract ${contract_id} not found.` },
      { status: 404 },
    );
  }

  // Guardrails: only retry contracts that are eligible for minting
  if (contract.status !== 'active') {
    return NextResponse.json(
      {
        error: 'wrong_status',
        message: `Contract is in status='${contract.status}'. Mint only fires on 'active'. Both parties must sign first.`,
      },
      { status: 409 },
    );
  }

  if (contract.nft_mint_status === 'minted' && contract.nft_token_id) {
    return NextResponse.json(
      {
        error: 'already_minted',
        message: 'Contract already has an NFT minted.',
        nft_token_id: contract.nft_token_id,
        nft_tx_hash: contract.nft_tx_hash,
      },
      { status: 409 },
    );
  }

  // Reset to pending and retry. Synchronous await so we know the outcome
  // before responding — this function has 120s, ample for Base mainnet.
  await db
    .from('contracts')
    .update({ nft_mint_status: 'pending' })
    .eq('id', contract.id);

  try {
    await mintContractNFTAsync(contract.id);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('cNFT retry mint failed:', contract.contract_id, errMsg);
    return NextResponse.json(
      {
        error: 'mint_failed',
        message: `Mint attempt failed: ${errMsg.slice(0, 300)}`,
        contract_id: contract.contract_id,
      },
      { status: 500 },
    );
  }

  // Re-read the contract to return the populated fields
  const { data: after } = await db
    .from('contracts')
    .select('contract_id, status, nft_mint_status, nft_token_id, nft_counterparty_token_id, nft_tx_hash, nft_counterparty_tx_hash, nft_holder_wallet, nft_counterparty_wallet, nft_minted_at')
    .eq('id', contract.id)
    .single();

  return NextResponse.json(
    {
      ok: true,
      message: 'Mint retry attempted. Check fields below for outcome.',
      contract: after,
    },
    { status: 200 },
  );
}

export async function OPTIONS(request: Request) {
  return corsOptions(request);
}
