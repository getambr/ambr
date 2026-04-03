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
    .select('id, contract_id, status, sha256_hash, amendment_type, parent_contract_hash, created_at, updated_at, revoked_at, revoked_by, revocation_reason, expiry_date');

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

  // Count signatures
  const { count: signatureCount } = await db
    .from('signatures')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contract.id);

  // Find amendments (child contracts)
  const { data: amendments } = await db
    .from('contracts')
    .select('contract_id, status, amendment_type, created_at, sha256_hash')
    .eq('parent_contract_hash', contract.sha256_hash)
    .order('created_at', { ascending: true });

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

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: contract.status,
    sha256_hash: contract.sha256_hash,
    amendment_type: contract.amendment_type,
    signatures: signatureCount ?? 0,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
    revoked_at: contract.revoked_at,
    revoked_by: contract.revoked_by,
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
    reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
  });
}

export { corsOptions as OPTIONS };
