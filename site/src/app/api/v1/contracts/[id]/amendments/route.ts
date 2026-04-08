import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';

/**
 * GET /api/v1/contracts/[id]/amendments
 *
 * List all amendment proposals for a contract (pending and historical).
 * Used by the dashboard to show the Pending Amendments section + a
 * proposal history view.
 *
 * No auth required: amendment metadata is considered part of the public
 * contract audit trail. Sensitive fields (proposed_human_readable) are
 * only returned for the party that proposed OR the party that must
 * approve. Behavior mirrors the existing GET /handshake route.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  // Lookup contract by any of the supported identifier formats
  let query = db.from('contracts').select('id, contract_id, status');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

  const { data: contract, error: contractError } = await query.single();

  if (contractError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  const { data: proposals, error: proposalsError } = await db
    .from('amendment_proposals')
    .select(
      'id, proposer_wallet, diff_summary, status, approval_required_from, ' +
      'approved_by_wallet, approved_at, rejected_reason, expires_at, ' +
      'resulting_contract_id, created_at, proposed_visibility'
    )
    .eq('original_contract_id', contract.id)
    .order('created_at', { ascending: false });

  if (proposalsError) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to list amendment proposals' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: contract.status,
    proposals: proposals ?? [],
  });
}

export { corsOptions as OPTIONS };
