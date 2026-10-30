import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { generateContract } from '@/lib/llm/generate-contract';
import {
  generationUnavailableBody,
  getProviderUnavailableSeconds,
  recordGenerationFailure,
  recordGenerationSuccess,
} from '@/lib/llm/availability';
import {
  hashContract,
  generateContractId,
  storeContract,
  decrementCredits,
  grantCredits,
} from '@/lib/contract-engine';
import { logAudit } from '@/lib/audit';
import { hasEnoughCredits, insufficientCreditsBody } from '@/lib/credits';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { rateLimit } from '@/lib/rate-limit';
import { corsOptions } from '@/lib/cors';
import { mintContractNFTAsync } from '@/lib/chain/cnft-mint';
import { requiresHumanEscalation } from '@/lib/compliance/art14';
import { verifyMessage } from 'ethers';

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

  const db = getSupabaseAdmin();

  // Lookup the original contract
  let contractQuery = db
    .from('contracts')
    .select('id, contract_id, sha256_hash, template_id, status, machine_readable, oversight_threshold_usd, visibility');
  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }
  contractQuery = contractQuery.eq(column, id);

  const { data: original, error: originalError } = await contractQuery.single();
  if (originalError || !original) {
    return NextResponse.json(
      { error: 'not_found', message: 'Original contract not found' },
      { status: 404 },
    );
  }

  // Only an active contract can be amended. Without this gate, approving a
  // pending proposal on a revoked/expired/terminated contract would mint a
  // fresh ACTIVE successor — resurrecting authority the principal already
  // withdrew (the successor would also escape the revocation cascade, which
  // ran at revoke time).
  if (original.status !== 'active') {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: `Cannot approve an amendment on a contract with status '${original.status}'. Only active contracts can be amended.`,
      },
      { status: 422 },
    );
  }

  // Lookup the proposal
  const { data: proposal, error: proposalError } = await db
    .from('amendment_proposals')
    .select('id, original_contract_id, proposer_wallet, proposed_parameters, status, approval_required_from, expires_at, proposed_visibility')
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

  // Authorization: the caller must prove CONTROL of the counterparty wallet.
  //
  // `approval_required_from` is published by GET /amendments with no auth, and
  // that disclosure is deliberate (proposal metadata is public audit trail). So
  // knowing the address proves nothing. Never accept a bare `approver_wallet`
  // string: any API key holder could read the counterparty's address from a
  // public endpoint, echo it back, and unilaterally countersign a bilateral
  // amendment, which mints cNFTs and moves the original contract to a terminal
  // state. The defence is proof, not secrecy.
  const body = await request.json().catch(() => ({}));
  const expectedApprover = proposal.approval_required_from.toLowerCase();

  let callerWallet: string | null = null;
  let signatureProven = false;

  if (
    typeof body.approver_wallet === 'string' &&
    typeof body.signature === 'string' &&
    typeof body.message === 'string'
  ) {
    // Bound to THIS proposal and THIS contract so a signature cannot be replayed
    // from another amendment, from /sign, or from a wallet-connect login.
    if (
      !body.message.includes(proposal.id) ||
      !body.message.includes(original.sha256_hash) ||
      !/approv/i.test(body.message)
    ) {
      return NextResponse.json(
        {
          error: 'message_mismatch',
          message:
            'Signed message must state approval intent and contain both the proposal id and the contract SHA-256 hash.',
        },
        { status: 400 },
      );
    }

    let recovered: string;
    try {
      recovered = verifyMessage(body.message, body.signature).toLowerCase();
    } catch {
      return NextResponse.json(
        { error: 'invalid_signature', message: 'Failed to verify wallet signature' },
        { status: 401 },
      );
    }

    if (recovered !== body.approver_wallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'signature_mismatch', message: 'Signature does not match approver_wallet' },
        { status: 401 },
      );
    }

    callerWallet = recovered;
    signatureProven = true;
  } else if (apiCtx.principalWallet) {
    // A registered delegation is the only other credential with a real
    // cryptographic chain: the wallet was proven when it was bound via
    // POST /api/v1/delegations. Note it no longer takes precedence over an
    // explicit signature, so a delegated caller cannot assert a third address.
    callerWallet = apiCtx.principalWallet.toLowerCase();
  }

  if (!callerWallet || callerWallet !== expectedApprover) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message:
          `This proposal can only be approved by ${expectedApprover}. ` +
          `Sign an approval message naming this proposal and the contract hash ` +
          `(approver_wallet + signature + message), or link your API key to that ` +
          `wallet via POST /api/v1/delegations.`,
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
    // A human is evidenced only by a fresh signature over a message naming this
    // proposal; a bare API key is treated as the agent and escalates. Do not
    // test `!apiCtx.principalWallet || ...` here: that counts an API key with NO
    // registered delegation as "the principal acting directly" and skips Article
    // 14 escalation entirely, so registering a delegation honestly would subject
    // you to oversight while skipping it would exempt you at any amount.
    const isPrincipalDirect = signatureProven;

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
    .select('id, slug, category, price_cents, is_one_sided')
    .eq('id', original.template_id)
    .single();

  if (!template) {
    return NextResponse.json(
      { error: 'not_found', message: 'Original contract template no longer exists' },
      { status: 404 },
    );
  }

  // Credits check: the amendment burns the parent contract's template price
  // (1 credit = 1 cent). The 402 body mirrors POST /contracts.
  const priceCents = template.price_cents as number;
  if (!hasEnoughCredits(apiCtx.credits, priceCents)) {
    return NextResponse.json(
      {
        ...insufficientCreditsBody(priceCents, apiCtx.credits),
        message: 'Insufficient credits to approve amendment (generation burns the original template price)',
      },
      { status: 402 },
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

  // Provider known to be out of quota: refuse before burning any credits.
  const providerDownSeconds = getProviderUnavailableSeconds();
  if (providerDownSeconds !== null) {
    return NextResponse.json(generationUnavailableBody(providerDownSeconds), {
      status: 503,
      headers: { 'Retry-After': String(providerDownSeconds) },
    });
  }

  // Burn the parent template's price BEFORE generating, so a request that
  // races the pre-check above cannot get an amendment for free. Refunded in
  // the catch below when generation fails.
  const burned = await decrementCredits(apiCtx.keyId, priceCents);
  if (burned === null) {
    return NextResponse.json(
      {
        ...insufficientCreditsBody(priceCents, apiCtx.credits),
        message: 'Insufficient credits to approve amendment (generation burns the original template price)',
      },
      { status: 402 },
    );
  }

  let contractStored = false;
  try {
    // Generate the amendment contract via Kimi
    const newContractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: template.slug,
      parameters: proposal.proposed_parameters as Record<string, unknown>,
      principalDeclaration,
      contractId: newContractId,
    });
    recordGenerationSuccess();

    const sha256Hash = hashContract(humanReadable, machineReadable);

    // Store the new amendment contract linked to the original
    const newContract = await storeContract({
      contractId: newContractId,
      templateId: template.id,
      contractType: template.category,
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
      // Q1: honor proposed_visibility from the proposal if the proposer
      // requested a change; otherwise inherit from the parent contract.
      // Counterparty saw + approved the change at the /approve step, so
      // this is the bilateral decision.
      visibility:
        ((proposal as unknown as { proposed_visibility: string | null }).proposed_visibility as
          | 'private'
          | 'metadata_only'
          | 'public'
          | 'encrypted'
          | null) ??
        (original.visibility as 'private' | 'metadata_only' | 'public' | 'encrypted') ??
        'private',
      initialStatus: 'active',
      // The proposer signs for the amendment (the approver countersigns below),
      // so the wallet that must have signed is on the row like any other
      // contract's. The status endpoint reads the proposal itself for the
      // required signers (lib/contract/validity.ts).
      principalWallet: proposal.proposer_wallet,
      isOneSided: Boolean(template.is_one_sided),
    });
    contractStored = true;

    // Derive for audit log + response
    const proposedVisibility = (proposal as unknown as { proposed_visibility: string | null })
      .proposed_visibility;
    const visibilityChanged =
      proposedVisibility !== null && proposedVisibility !== original.visibility;

    // Transition the original to 'amended'. Surface a failure instead of
    // swallowing it — if the DB transition guard rejects this (e.g. the
    // original reached a terminal status between our read and this write),
    // the successor must not silently coexist with a still-authoritative
    // original.
    const { error: amendedError } = await db
      .from('contracts')
      .update({ status: 'amended' })
      .eq('id', original.id);
    if (amendedError) {
      console.error('Failed to mark original as amended:', amendedError);
      return NextResponse.json(
        {
          error: 'status_update_failed',
          message: `Amendment contract ${newContract.contract_id} was created, but the original could not be marked as amended. Contact support before relying on either document.`,
          amendment_contract_id: newContract.contract_id,
        },
        { status: 500 },
      );
    }

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
    const signatureRows = [
      {
        contract_id: newContract.id,
        signer_wallet: proposal.proposer_wallet,
        signature: `proposed_via_proposal:${proposal.id}`,
        message_hash: amendmentMessageHash,
        signature_level: 'simple',
      },
    ];
    // Proposer and approver being one wallet: one row (signatures are unique per wallet).
    if (String(callerWallet).toLowerCase() !== String(proposal.proposer_wallet).toLowerCase()) {
      signatureRows.push({
        contract_id: newContract.id,
        signer_wallet: callerWallet,
        signature: `approved_via_proposal:${proposal.id}`,
        message_hash: amendmentMessageHash,
        signature_level: 'simple',
      });
    }
    const { error: signaturesError } = await db.from('signatures').insert(signatureRows);
    if (signaturesError) {
      // Without its signatures the amendment reads as not valid (missing
      // signatures), which is true: say so and leave a trail instead of going on.
      console.error('Failed to store amendment signatures:', signaturesError);
      await logAudit({
        event_type: 'amendment_signatures_failed',
        severity: 'error',
        actor: apiCtx.email,
        details: {
          proposal_id: proposal.id,
          original_contract_id: original.contract_id,
          amendment_contract_id: newContract.contract_id,
          error: signaturesError.message,
        },
      });
      return NextResponse.json(
        {
          error: 'signature_storage_failed',
          message: `Amendment contract ${newContract.contract_id} was created, but its signatures could not be stored, so it does not read as valid yet. Contact support before relying on either document.`,
          amendment_contract_id: newContract.contract_id,
        },
        { status: 500 },
      );
    }

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
          visibility_changed: visibilityChanged,
          old_visibility: original.visibility,
          new_visibility: proposedVisibility ?? original.visibility,
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
        visibility: proposedVisibility ?? original.visibility,
        visibility_changed: visibilityChanged,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Amendment approval failed:', err);
    const failure = recordGenerationFailure(err);
    if (!contractStored) {
      const refunded = (await grantCredits(apiCtx.keyId, priceCents)) !== null;
      await logAudit({
        event_type: 'credits_refunded_generation_failed',
        severity: refunded ? 'warn' : 'error',
        actor: apiCtx.keyId,
        details: {
          template: template.slug,
          credits: priceCents,
          refunded,
          via: 'amendment_approve',
          error_class: failure.errorClass,
          error_message: failure.errorMessage.slice(0, 500),
        },
      });
    }
    if (failure.unavailable) {
      return NextResponse.json(generationUnavailableBody(failure.retryAfterSeconds), {
        status: 503,
        headers: { 'Retry-After': String(failure.retryAfterSeconds) },
      });
    }
    return NextResponse.json(
      { error: 'generation_failed', message: 'Failed to generate amendment contract. Please try again.' },
      { status: 500 },
    );
  }
}

export { corsOptions as OPTIONS };
