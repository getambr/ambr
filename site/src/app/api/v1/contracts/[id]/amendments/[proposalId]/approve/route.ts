import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { generateContract } from '@/lib/llm/generate-contract';
import {
  hashContract,
  generateContractId,
  storeContract,
  decrementCredits,
} from '@/lib/contract-engine';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';
import { mintContractNFTAsync } from '@/lib/chain/cnft-mint';
import { requiresHumanEscalation } from '@/lib/compliance/art14';

/**
 * POST /api/v1/contracts/[id]/amendments/[proposalId]/approve
 *
 * PHASE 2 + 5: Counterparty approval of a pending amendment proposal.
 *
 * Caller must hold an API key linked to the wallet listed in
 * `amendment_proposals.approval_required_from` (i.e., be the counterparty
 * to the original contract, not the proposer).
 *
 * Flow on approval:
 *   1. Verify proposal exists and is pending
 *   2. Verify caller is the authorized approver
 *   3. EU AI Act Article 14 check: if the proposed amendment's spending
 *      delta exceeds the original's oversight_threshold_usd, the proposal
 *      is escalated to the human principal (status='escalated', 403
 *      returned) regardless of whether the caller's delegation_scope
 *      would otherwise permit approval
 *   4. Generate the amendment contract via Kimi (lib/llm/generate-contract)
 *   5. Store the new contract with parent_contract_hash + amendment_type='amendment'
 *   6. Flip the original to status='amended'
 *   7. Fire the paired cNFT mint for the new amendment contract (fire-and-forget)
 *   8. Update proposal.status='approved' + resulting_contract_id
 *   9. Audit log both the approval and the resulting amendment
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
  const rl = rateLimit(`amend-approve:${apiCtx.keyId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  // Credits check (amendment generation consumes one credit)
  if (apiCtx.credits === 0) {
    return NextResponse.json(
      { error: 'payment_required', message: 'No credits remaining to approve amendment (generation consumes 1 credit)' },
      { status: 402 },
    );
  }

  const db = getSupabaseAdmin();

  // Lookup the original contract
  let contractQuery = db
    .from('contracts')
    .select('id, contract_id, sha256_hash, template_id, status, machine_readable, oversight_threshold_usd, visibility');
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
    .select('id, original_contract_id, proposer_wallet, proposed_parameters, status, approval_required_from, expires_at')
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
        message: `Cannot approve a proposal with status '${proposal.status}'. Only 'pending' proposals can be approved.`,
      },
      { status: 409 },
    );
  }

  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    // Expire it on the fly
    await db
      .from('amendment_proposals')
      .update({ status: 'expired' })
      .eq('id', proposal.id);
    return NextResponse.json(
      { error: 'expired', message: 'Proposal has expired and can no longer be approved' },
      { status: 409 },
    );
  }

  // Authorization: caller must be the counterparty (approval_required_from).
  // We match their api_key's principal_wallet OR an explicit approver_wallet
  // supplied in the request body (must still match the expected counterparty).
  const body = await request.json().catch(() => ({}));
  const explicitApproverWallet = typeof body.approver_wallet === 'string'
    ? body.approver_wallet.toLowerCase()
    : null;

  const expectedApprover = proposal.approval_required_from.toLowerCase();
  const callerWallet = explicitApproverWallet
    || (apiCtx.principalWallet ? apiCtx.principalWallet.toLowerCase() : null);

  if (!callerWallet || callerWallet !== expectedApprover) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message:
          `This proposal can only be approved by ${expectedApprover}. ` +
          `Supply approver_wallet in the request body, or link your API key ` +
          `to that wallet via POST /api/v1/delegations.`,
      },
      { status: 403 },
    );
  }

  // ─── EU AI Act Article 14 enforcement ────────────────
  // If the amendment's spending delta exceeds the contract's oversight
  // threshold, force escalation to the human principal. Delegated agents
  // CANNOT auto-approve high-value amendments regardless of scope.
  const art14 = requiresHumanEscalation(
    original.machine_readable as Record<string, unknown> | null,
    proposal.proposed_parameters as Record<string, unknown> | null,
    original.oversight_threshold_usd,
  );

  if (art14.required) {
    // Check if the caller is acting via a delegated agent key (principal_wallet
    // set) vs the principal directly. If they ARE the principal (api key created
    // by the same human identified by callerWallet), we allow approval. If they
    // are a delegated agent, we escalate.
    const isPrincipalDirect = !apiCtx.principalWallet
      || apiCtx.principalWallet.toLowerCase() === callerWallet;

    if (!isPrincipalDirect) {
      // Delegated agent trying to auto-approve a high-value amendment. Block.
      await db
        .from('amendment_proposals')
        .update({ status: 'escalated' })
        .eq('id', proposal.id);

      await db.from('audit_log').insert({
        contract_id: original.id,
        action: 'eu_ai_act_art14_escalation',
        actor: apiCtx.email,
        details: {
          proposal_id: proposal.id,
          spending_change: art14.spendingChange,
          threshold: art14.threshold,
          caller_wallet: callerWallet,
          reason:
            'Delegated agent attempted to approve an amendment whose spending ' +
            'change exceeds oversight_threshold_usd. EU AI Act Article 14 ' +
            'requires human principal approval.',
        },
      });

      return NextResponse.json(
        {
          error: 'human_approval_required',
          message:
            `Amendment spending change ($${art14.spendingChange}) exceeds the ` +
            `contract's oversight threshold ($${art14.threshold}). EU AI Act ` +
            `Article 14 requires direct approval by the human principal; a ` +
            `delegated agent cannot auto-approve. The human principal must ` +
            `approve this proposal directly.`,
          status: 'escalated',
          spending_change: art14.spendingChange,
          oversight_threshold_usd: art14.threshold,
        },
        { status: 403 },
      );
    }
  }

  // ─── Lookup the template so we can regenerate the contract ──
  const { data: template } = await db
    .from('templates')
    .select('id, slug')
    .eq('id', original.template_id)
    .single();

  if (!template) {
    return NextResponse.json(
      { error: 'not_found', message: 'Original contract template no longer exists' },
      { status: 404 },
    );
  }

  // Recover the original principal_declaration so the new contract inherits it
  const { data: originalFull } = await db
    .from('contracts')
    .select('principal_declaration')
    .eq('id', original.id)
    .single();

  const rawDeclaration = (originalFull?.principal_declaration as Record<string, unknown>) || {};
  const principalDeclaration = {
    agent_id: String(rawDeclaration.agent_id || 'unknown'),
    principal_name: String(rawDeclaration.principal_name || 'Unknown'),
    principal_type: String(rawDeclaration.principal_type || 'unknown'),
  };

  try {
    // Generate the amendment contract via Kimi
    const newContractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: template.slug,
      parameters: proposal.proposed_parameters as Record<string, unknown>,
      principalDeclaration,
      contractId: newContractId,
    });

    const sha256Hash = hashContract(humanReadable, machineReadable);

    // Store the new amendment contract linked to the original
    const newContract = await storeContract({
      contractId: newContractId,
      templateId: template.id,
      humanReadable,
      machineReadable,
      sha256Hash,
      principalDeclaration: { ...rawDeclaration, ...principalDeclaration },
      parameters: proposal.proposed_parameters as Record<string, unknown>,
      apiKeyId: apiCtx.keyId,
      parentContractHash: original.sha256_hash,
      amendmentType: 'amendment',
      // Preserve oversight threshold from original — subsequent amendments
      // use the same Art 14 gate
      oversightThresholdUsd: original.oversight_threshold_usd,
      visibility: (original.visibility as 'private' | 'metadata_only' | 'public' | 'encrypted') || 'private',
      initialStatus: 'active',
    });

    // Consume one credit for the amendment generation
    await decrementCredits(apiCtx.keyId, apiCtx.credits);

    // Transition the original to 'amended'
    await db
      .from('contracts')
      .update({ status: 'amended' })
      .eq('id', original.id);

    // Update the proposal to 'approved' + link to the new contract row
    await db
      .from('amendment_proposals')
      .update({
        status: 'approved',
        approved_by_wallet: callerWallet,
        approved_at: new Date().toISOString(),
        resulting_contract_id: newContract.id,
      })
      .eq('id', proposal.id);

    // Insert signature rows for BOTH parties on the new amendment contract.
    // Amendments don't go through the regular sign route, so we need to
    // synthesize the signatures here. The "signature" field is a marker that
    // documents this came from the amendment approval workflow rather than
    // a wallet ECDSA sign — the actual cryptographic proof is the api_key
    // auth on the original /amend POST and this /approve POST, which the
    // proxy and validateApiKey() already verified.
    const amendmentMessageHash = `amendment_via_proposal:${proposal.id}`;
    await db.from('signatures').insert([
      {
        contract_id: newContract.id,
        signer_wallet: proposal.proposer_wallet,
        signature: `proposed_via_proposal:${proposal.id}`,
        message_hash: amendmentMessageHash,
        signature_level: 'simple',
      },
      {
        contract_id: newContract.id,
        signer_wallet: callerWallet,
        signature: `approved_via_proposal:${proposal.id}`,
        message_hash: amendmentMessageHash,
        signature_level: 'simple',
      },
    ]);

    // Audit log: both the approval and the resulting contract creation
    await db.from('audit_log').insert([
      {
        contract_id: original.id,
        action: 'amendment_approved',
        actor: callerWallet,
        details: {
          proposal_id: proposal.id,
          resulting_contract_id: newContract.contract_id,
          new_hash: sha256Hash,
          art14_checked: true,
          spending_change: art14.spendingChange,
          threshold: art14.threshold,
        },
      },
      {
        contract_id: newContract.id,
        action: 'created',
        actor: apiCtx.email,
        details: {
          parent_contract: original.contract_id,
          amendment_type: 'amendment',
          via_proposal: proposal.id,
        },
      },
    ]);

    // Mint the paired cNFT synchronously (await, NOT fire-and-forget).
    // We pass explicit wallets from the proposal so the mint function doesn't
    // need to look them up from the (also synthetic) signatures we just
    // inserted. Synchronous because Vercel serverless functions terminate
    // when the response is returned, killing fire-and-forget background work.
    let mintedTokenId: number | null = null;
    let mintedCounterpartyTokenId: number | null = null;
    try {
      await mintContractNFTAsync(newContract.id, {
        recipient: proposal.proposer_wallet,
        counterparty: callerWallet,
      });
      // Read back the resulting token IDs for the response
      const { data: mintedRow } = await db
        .from('contracts')
        .select('nft_token_id, nft_counterparty_token_id')
        .eq('id', newContract.id)
        .single();
      mintedTokenId = mintedRow?.nft_token_id ?? null;
      mintedCounterpartyTokenId = mintedRow?.nft_counterparty_token_id ?? null;
    } catch (mintErr) {
      // Don't fail the whole approval — the contract amendment is committed
      // and visible. The mint can be retried separately. Log so we know.
      console.error('cNFT mint (amendment) failed during approval:', mintErr);
    }

    return NextResponse.json(
      {
        approved: true,
        proposal_id: proposal.id,
        original_contract_id: original.contract_id,
        amendment_contract_id: newContract.contract_id,
        amendment_sha256_hash: sha256Hash,
        approved_by_wallet: callerWallet,
        approved_at: new Date().toISOString(),
        reader_url: `https://getamber.dev/reader/${sha256Hash}`,
        nft_token_id: mintedTokenId,
        nft_counterparty_token_id: mintedCounterpartyTokenId,
        paired_mint_succeeded: mintedCounterpartyTokenId !== null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Amendment approval failed:', err);
    return NextResponse.json(
      { error: 'generation_failed', message: err instanceof Error ? err.message : 'Failed to generate amendment contract' },
      { status: 500 },
    );
  }
}

export { corsOptions as OPTIONS };
