import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { validateApiKey } from '@/lib/api-auth';
import { corsOptions } from '@/lib/cors';
import { deriveCapabilities } from '@/lib/contract-capabilities';
import { evaluateContractValidity } from '@/lib/contract/validity';

/**
 * GET /api/v1/contracts/[id]/status
 *
 * Public endpoint (no auth required). Returns lightweight status info: status,
 * amendment chain, signatures. For PRIVATE/ENCRYPTED contracts the signer
 * wallets (and a few other identifying fields) are stripped — UNLESS the caller
 * presents the owning account's API key, in which case the owner sees the full
 * unstripped data. The dashboard relies on this to show a per-party
 * "signed / awaiting" indicator for bilateral contracts.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  // Lookup contract (lightweight fields only). api_key_id lets us detect the
  // owner so they get unstripped signer wallets even on a private contract.
  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, amendment_type, parent_contract_hash, created_at, updated_at, revoked_at, revoked_by, revocation_reason, expiry_date, visibility, api_key_id, machine_readable, human_readable, principal_wallet, is_one_sided, parameters');

  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }
  query = query.eq(column, id);

  const { data: contract, error } = await query.single();

  if (error || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Fetch signature records (not just count — dashboard needs the array)
  const { data: signatureRows } = await db
    .from('signatures')
    .select('signer_wallet, signed_at, signature_level')
    .eq('contract_id', contract.id)
    .order('signed_at', { ascending: true });

  const signatures = signatureRows ?? [];

  // Find amendments (child contracts)
  const { data: amendments } = await db
    .from('contracts')
    .select('contract_id, status, amendment_type, created_at, sha256_hash')
    .eq('parent_contract_hash', contract.sha256_hash)
    .order('created_at', { ascending: true });

  // Amendment proposals (v0.2.0 bilateral governance)
  const { data: proposals } = await db
    .from('amendment_proposals')
    .select(
      'id, proposer_wallet, diff_summary, status, approval_required_from, ' +
      'approved_by_wallet, approved_at, rejected_reason, expires_at, ' +
      'resulting_contract_id, created_at, proposed_visibility'
    )
    .eq('original_contract_id', contract.id)
    .order('created_at', { ascending: false });

  // Find parent (if this is an amendment)
  let parent = null;
  if (contract.parent_contract_hash) {
    const { data: parentContract } = await db
      .from('contracts')
      .select('contract_id, status, sha256_hash')
      .eq('sha256_hash', contract.parent_contract_hash)
      .single();
    if (parentContract) {
      parent = {
        contract_id: parentContract.contract_id,
        status: parentContract.status,
        sha256_hash: parentContract.sha256_hash,
      };
    }
  }

  const proposalsList = (proposals ?? []) as unknown as { status: string }[];
  const visibility = (contract.visibility as string) || 'private';
  // The owner (caller presenting the account's API key that created the
  // contract) always sees full data — stripping is for unknown third parties.
  const auth = await validateApiKey(request);
  const isOwner = !!auth && !!contract.api_key_id && auth.keyId === contract.api_key_id;
  const isRestricted = (visibility === 'private' || visibility === 'encrypted') && !isOwner;

  // Every required signature must be on file, and the stored text must still
  // match its creation hash (lib/contract/validity.ts, shared with the MCP
  // status tool). A row flipped to 'active' by anything other than a completed
  // signing does not make a valid contract.
  const validity = await evaluateContractValidity(
    db,
    contract as unknown as Parameters<typeof evaluateContractValidity>[1],
    signatures.map((s) => s.signer_wallet as string),
  );
  const { isExpired, missingSigners } = validity;

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: contract.status,
    // Derived at read time: a contract is valid only while it is active,
    // not revoked, not past its expiry date, fully signed, and its text still
    // matches its creation hash. The status column alone is not the source of
    // truth for "is this authority in force right now".
    is_currently_valid: validity.isCurrentlyValid,
    // Why it is not valid (empty when valid). missing_signers names the slots
    // ('principal' / 'counterparty') still waiting for a signature.
    validity_reasons: validity.reasons,
    ...(missingSigners.length > 0 ? { missing_signers: missingSigners } : {}),
    is_expired: isExpired,
    visibility,
    sha256_hash: contract.sha256_hash,
    amendment_type: contract.amendment_type,
    signatures: isRestricted
      ? signatures.map((s) => ({ signed_at: s.signed_at, signature_level: s.signature_level }))
      : signatures,
    signature_count: signatures.length,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
    revoked_at: contract.revoked_at,
    revoked_by: isRestricted ? undefined : contract.revoked_by,
    // Free-text operator field — strip for restricted viewers, same as revoked_by.
    revocation_reason: isRestricted ? undefined : contract.revocation_reason,
    expiry_date: contract.expiry_date,
    // Machine-readable binding terms (what the delegated agent may/may not do)
    // so a counterparty agent can act within scope. Stripped for restricted
    // (private/encrypted, non-owner) viewers; null when there's no such scope.
    binding_terms: isRestricted
      ? undefined
      : deriveCapabilities(contract.machine_readable as Record<string, unknown> | null),
    parent: parent,
    amendments: (amendments ?? []).map((a) => ({
      contract_id: a.contract_id,
      status: a.status,
      amendment_type: a.amendment_type,
      sha256_hash: a.sha256_hash,
      created_at: a.created_at,
    })),
    proposals: isRestricted
      ? proposalsList.map((p) => ({ status: (p as Record<string, unknown>).status, created_at: (p as Record<string, unknown>).created_at }))
      : proposalsList,
    pending_proposals: proposalsList.filter((p: { status: string }) => p.status === 'pending').length,
    reader_url: visibility === 'public' || visibility === 'metadata_only'
      ? `https://getamber.dev/reader/${contract.sha256_hash}`
      : undefined,
  });
}

export { corsOptions as OPTIONS };
