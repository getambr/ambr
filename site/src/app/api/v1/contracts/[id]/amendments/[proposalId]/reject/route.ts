import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';
import { getCurrentHolders } from '@/lib/chain/cnft-holders';

/**
 * POST /api/v1/contracts/[id]/amendments/[proposalId]/reject
 *
 * PHASE 2: Counterparty rejection of a pending amendment proposal.
 *
 * Caller must hold an API key linked to the wallet listed in
 * `amendment_proposals.approval_required_from`. On rejection:
 *   - Proposal moves to status='rejected' with optional rejected_reason
 *   - The original contract is NOT touched — it remains active and unchanged
 *   - No Kimi call, no cNFT mint, no credit consumption
 *   - Audit log entry written
 *
 * The proposer can submit a new proposal at any time.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> },
) {
  const { id, proposalId } = await params;

  // Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header' },
      { status: 401 },
    );
  }

  // Rate limit
  const rl = rateLimit(`amend-reject:${apiCtx.keyId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const db = getSupabaseAdmin();

  // Lookup the original contract for ownership routing.
  // Select cNFT token IDs too — Q2 novation-aware rejection uses current
  // on-chain holders (live ownerOf) rather than the signatures snapshot.
  let contractQuery = db
    .from('contracts')
    .select('id, contract_id, nft_token_id, nft_counterparty_token_id');
  if (id.startsWith('amb-')) {
    contractQuery = contractQuery.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    contractQuery = contractQuery.eq('sha256_hash', id);
  } else {
    contractQuery = contractQuery.eq('id', id);
  }

  const { data: original, error: originalError } = await contractQuery.single();
  if (originalError || !original) {
    return NextResponse.json(
      { error: 'not_found', message: 'Original contract not found' },
      { status: 404 },
    );
  }

  // Lookup the proposal
  const { data: proposal, error: proposalError } = await db
    .from('amendment_proposals')
    .select('id, original_contract_id, status, approval_required_from, proposer_wallet, expires_at')
    .eq('id', proposalId)
    .eq('original_contract_id', original.id)
    .single();

  if (proposalError || !proposal) {
    return NextResponse.json(
      { error: 'not_found', message: 'Amendment proposal not found' },
      { status: 404 },
    );
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json(
      {
        error: 'invalid_state',
        message: `Cannot reject a proposal with status '${proposal.status}'. Only 'pending' proposals can be rejected.`,
      },
      { status: 409 },
    );
  }

  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    await db
      .from('amendment_proposals')
      .update({ status: 'expired' })
      .eq('id', proposal.id);
    return NextResponse.json(
      { error: 'expired', message: 'Proposal has expired and can no longer be rejected' },
      { status: 409 },
    );
  }

  // Authorization: caller must be a CURRENT party to the contract and not
  // the proposer. "Current party" = live cNFT holder via ownerOf (or the
  // signatures table for legacy contracts). This handles novation: if the
  // counterparty at proposal time was Bob but Bob has since transferred
  // his token to Carol (with the proposer's bilateral consent via
  // approveTransfer), Carol is now authorized to reject.
  //
  // The proposal.approval_required_from field is a SNAPSHOT of who the
  // counterparty was at proposal-creation time, not the authoritative
  // source. Authority comes from live chain ownership.
  const body = await request.json().catch(() => ({}));
  const explicitRejecterWallet = typeof body.rejecter_wallet === 'string'
    ? body.rejecter_wallet.toLowerCase()
    : null;
  const rejectedReason = typeof body.reason === 'string' ? body.reason : null;

  const holdersResult = await getCurrentHolders({
    id: original.id,
    nft_token_id: original.nft_token_id,
    nft_counterparty_token_id: original.nft_counterparty_token_id,
  });

  const partyWallets = holdersResult.currentHolders;
  const callerWallet = explicitRejecterWallet
    || (apiCtx.principalWallet ? apiCtx.principalWallet.toLowerCase() : null);

  if (!callerWallet || !partyWallets.includes(callerWallet)) {
    return NextResponse.json(
      {
        error: 'rejecter_not_party',
        message:
          'Rejection can only be performed by a current party (cNFT holder) of this contract. ' +
          'Supply rejecter_wallet in the request body matching a current holder, ' +
          'or link your API key to that wallet via POST /api/v1/delegations. ' +
          (holdersResult.fromChain
            ? 'Current holders were resolved from the cNFT contract on Base.'
            : 'Holders were resolved from the historical signatures table (no on-chain token IDs available).'),
        current_holders: partyWallets,
      },
      { status: 403 },
    );
  }

  // Disallow the proposer from rejecting their own proposal. Withdrawing
  // isn't supported yet — the proposer can just let it expire (30 days).
  if (callerWallet === proposal.proposer_wallet.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'proposer_cannot_reject',
        message:
          'The proposer cannot reject their own proposal. Let it expire, or ask the counterparty to reject it.',
      },
      { status: 403 },
    );
  }

  // Update the proposal to 'rejected'
  const { error: updateError } = await db
    .from('amendment_proposals')
    .update({
      status: 'rejected',
      rejected_reason: rejectedReason,
    })
    .eq('id', proposal.id);

  if (updateError) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to update proposal status' },
      { status: 500 },
    );
  }

  await db.from('audit_log').insert({
    contract_id: original.id,
    action: 'amendment_rejected',
    actor: callerWallet,
    details: {
      proposal_id: proposal.id,
      reason: rejectedReason,
    },
  });

  return NextResponse.json(
    {
      rejected: true,
      proposal_id: proposal.id,
      original_contract_id: original.contract_id,
      rejected_by_wallet: callerWallet,
      rejected_reason: rejectedReason,
      status: 'rejected',
    },
    { status: 200 },
  );
}

export { corsOptions as OPTIONS };
