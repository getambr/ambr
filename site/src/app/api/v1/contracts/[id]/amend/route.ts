import { NextResponse } from 'next/server';
import { createContractSchema } from '@/lib/validation/contract-schemas';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';
import { getCurrentHolders } from '@/lib/chain/cnft-holders';

const VALID_VISIBILITIES = ['private', 'metadata_only', 'public', 'encrypted'] as const;
type ContractVisibility = (typeof VALID_VISIBILITIES)[number];

/**
 * POST /api/v1/contracts/[id]/amend
 *
 * PHASE 2: Bilateral amendment workflow.
 *
 * Previously this endpoint generated and stored an amendment contract
 * immediately, unilaterally flipping the original's status to 'amended'.
 * That bypassed counterparty consent — either party could unilaterally
 * rewrite terms.
 *
 * Now: this endpoint creates a PENDING amendment_proposals row. The
 * counterparty (the other wallet that signed the original contract) must
 * explicitly approve the proposal before the amendment contract is
 * generated and the original's status changes. If the counterparty
 * rejects, the original remains active and unchanged.
 *
 * Approval flow is at POST /api/v1/contracts/[id]/amendments/[proposalId]/approve
 * Rejection flow is at POST /api/v1/contracts/[id]/amendments/[proposalId]/reject
 * Listing is at      GET  /api/v1/contracts/[id]/amendments
 *
 * The actual contract generation (Kimi call, hash, store) happens in the
 * approve endpoint, not here. This keeps Kimi costs and storage off the
 * critical path until both parties agree.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header' },
      { status: 401 },
    );
  }

  // Rate limit
  const rl = rateLimit(`amend:${apiCtx.keyId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  // Parse proposal body (reuses the same schema as contract creation —
  // the proposal contains the NEW parameters to apply via the same template)
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = createContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Optional fields beyond createContractSchema:
  //   diff_summary       — free-text describing the change
  //   proposer_wallet    — explicit proposer (must match api key principal)
  //   visibility         — proposed visibility change for the amendment
  const diffSummary = typeof body.diff_summary === 'string' ? body.diff_summary : null;
  const explicitProposerWallet = typeof body.proposer_wallet === 'string'
    ? body.proposer_wallet.toLowerCase()
    : null;
  const proposedVisibility: ContractVisibility | null =
    typeof body.visibility === 'string' && (VALID_VISIBILITIES as readonly string[]).includes(body.visibility)
      ? (body.visibility as ContractVisibility)
      : null;

  // Lookup original contract — needs the cNFT token IDs to query current holders
  const db = getSupabaseAdmin();
  let query = db.from('contracts').select('id, contract_id, status, sha256_hash, template_id, api_key_id, nft_token_id, nft_counterparty_token_id');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

  const { data: originalRaw, error: origError } = await query.single();

  if (origError || !originalRaw) {
    return NextResponse.json(
      { error: 'not_found', message: 'Original contract not found' },
      { status: 404 },
    );
  }

  // Cast: Supabase's untyped client resolves .select with concatenated columns
  // to GenericStringError. We own the schema and know the shape.
  const original = originalRaw as unknown as {
    id: string;
    contract_id: string;
    status: string;
    sha256_hash: string;
    template_id: string;
    api_key_id: string;
    nft_token_id: number | null;
    nft_counterparty_token_id: number | null;
  };

  if (original.status !== 'active') {
    return NextResponse.json(
      {
        error: 'invalid_state',
        message: `Cannot amend a contract with status '${original.status}'. Only 'active' contracts can be amended.`,
      },
      { status: 409 },
    );
  }

  // Look up CURRENT cNFT holders (the live source of truth for who is a party)
  // with the signatures table as a fallback for legacy contracts. Handles
  // novation: if Alice transferred her token to Carol with Bob's bilateral
  // consent, Carol is now a recognized proposer/counterparty even though the
  // signatures table still shows Alice.
  const holdersResult = await getCurrentHolders({
    id: original.id,
    nft_token_id: original.nft_token_id,
    nft_counterparty_token_id: original.nft_counterparty_token_id,
  });

  const partyWallets = holdersResult.currentHolders;

  if (partyWallets.length === 0) {
    return NextResponse.json(
      { error: 'no_parties', message: 'Cannot amend a contract with no current parties' },
      { status: 409 },
    );
  }

  // Resolve proposer wallet. Priority:
  //   1. explicit proposer_wallet from request body (must be in partyWallets)
  //   2. apiCtx.principalWallet (set via /api/v1/delegations)
  //   3. reject if we can't identify the proposer
  let proposerWallet: string | null = null;
  if (explicitProposerWallet && partyWallets.includes(explicitProposerWallet)) {
    proposerWallet = explicitProposerWallet;
  } else if (apiCtx.principalWallet && partyWallets.includes(apiCtx.principalWallet.toLowerCase())) {
    proposerWallet = apiCtx.principalWallet.toLowerCase();
  } else {
    return NextResponse.json(
      {
        error: 'proposer_not_party',
        message:
          'Cannot identify proposer as a current party to this contract. ' +
          'Either supply proposer_wallet in the request body matching a current cNFT holder, ' +
          'or link your API key to that wallet via POST /api/v1/delegations. ' +
          (holdersResult.fromChain
            ? 'Current holders were resolved from the cNFT contract on Base.'
            : 'Holders were resolved from the historical signatures table (no on-chain token IDs available).'),
        current_holders: partyWallets,
      },
      { status: 403 },
    );
  }

  // Determine counterparty. Takes the first current holder that isn't the proposer.
  const counterpartyWallet = partyWallets.find((w) => w !== proposerWallet);
  if (!counterpartyWallet) {
    return NextResponse.json(
      {
        error: 'single_party_contract',
        message:
          'Cannot propose a bilateral amendment on a single-party contract. ' +
          'Use the amendment flow only for contracts with at least two current cNFT holders.',
      },
      { status: 409 },
    );
  }

  // Create the pending proposal. No Kimi call, no new contract row yet — all
  // of that happens in the approve endpoint once the counterparty agrees.
  const { data: proposal, error: proposalError } = await db
    .from('amendment_proposals')
    .insert({
      original_contract_id: original.id,
      proposer_wallet: proposerWallet,
      proposer_api_key_id: apiCtx.keyId,
      proposed_parameters: parsed.data.parameters,
      diff_summary: diffSummary,
      status: 'pending',
      approval_required_from: counterpartyWallet,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days
      proposed_visibility: proposedVisibility,
    })
    .select('id, created_at, expires_at')
    .single();

  if (proposalError || !proposal) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to create amendment proposal' },
      { status: 500 },
    );
  }

  await db.from('audit_log').insert({
    contract_id: original.id,
    action: 'amendment_proposed',
    actor: proposerWallet,
    details: {
      proposal_id: proposal.id,
      counterparty: counterpartyWallet,
      diff_summary: diffSummary,
    },
  });

  return NextResponse.json(
    {
      proposal_id: proposal.id,
      original_contract_id: original.contract_id,
      proposer_wallet: proposerWallet,
      approval_required_from: counterpartyWallet,
      status: 'pending',
      expires_at: proposal.expires_at,
      created_at: proposal.created_at,
      approve_url: `/api/v1/contracts/${original.contract_id}/amendments/${proposal.id}/approve`,
      reject_url: `/api/v1/contracts/${original.contract_id}/amendments/${proposal.id}/reject`,
      list_url: `/api/v1/contracts/${original.contract_id}/amendments`,
    },
    { status: 201 },
  );
}

export { corsOptions as OPTIONS };
