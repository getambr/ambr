import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';

/**
 * GET /api/v1/contracts/[id]/status
 *
 * Public endpoint (no auth required).
 * Returns lightweight status info: status, amendment chain, signature count.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  // Lookup contract (lightweight fields only)
  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, amendment_type, parent_contract_hash, created_at, updated_at, revoked_at, revoked_by, revocation_reason, expiry_date, visibility');

  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

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
  const isRestricted = visibility === 'private' || visibility === 'encrypted';

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: contract.status,
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
    revocation_reason: contract.revocation_reason,
    expiry_date: contract.expiry_date,
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
