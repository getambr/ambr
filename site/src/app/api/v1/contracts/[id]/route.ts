import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';

/**
 * GET /api/v1/contracts/[id]
 *
 * Retrieve a contract by ID, SHA-256 hash, or UUID.
 *
 * Visibility:
 * - With valid API key (contract creator): full contract
 * - With valid share token (?token=...): full contract
 * - Otherwise: metadata only (contract_id, status, hash, dates)
 */

async function validateShareToken(
  db: ReturnType<typeof getSupabaseAdmin>,
  contractUuid: string,
  token: string,
): Promise<boolean> {
  const { data } = await db
    .from('share_tokens')
    .select('id, expires_at')
    .eq('contract_id', contractUuid)
    .eq('token', token)
    .single();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  // Determine lookup method based on format
  let query = db.from('contracts').select('*');

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

  const visibility = (contract.visibility as string) || 'private';

  // Public contracts: full text available to everyone
  if (visibility === 'public') {
    return NextResponse.json({
      contract_id: contract.contract_id,
      status: contract.status,
      visibility,
      human_readable: contract.human_readable,
      machine_readable: contract.machine_readable,
      sha256_hash: contract.sha256_hash,
      principal_declaration: contract.principal_declaration,
      amendment_type: contract.amendment_type,
      parent_contract_hash: contract.parent_contract_hash,
      created_at: contract.created_at,
      reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
    });
  }

  // metadata_only: never expose full text, even with auth
  if (visibility === 'metadata_only') {
    return NextResponse.json({
      contract_id: contract.contract_id,
      status: contract.status,
      visibility,
      sha256_hash: contract.sha256_hash,
      amendment_type: contract.amendment_type,
      parent_contract_hash: contract.parent_contract_hash,
      created_at: contract.created_at,
      reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
    });
  }

  // private / encrypted: require API key or share token
  let authorized = false;

  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const { data: keyData } = await db
      .from('api_keys')
      .select('id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (keyData && keyData.id === contract.api_key_id) {
      authorized = true;
    }
  }

  if (!authorized) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (token) {
      authorized = await validateShareToken(db, contract.id, token);
    }
  }

  if (authorized) {
    return NextResponse.json({
      contract_id: contract.contract_id,
      status: contract.status,
      visibility,
      human_readable: contract.human_readable,
      machine_readable: contract.machine_readable,
      sha256_hash: contract.sha256_hash,
      principal_declaration: contract.principal_declaration,
      amendment_type: contract.amendment_type,
      parent_contract_hash: contract.parent_contract_hash,
      created_at: contract.created_at,
      reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
    });
  }

  return NextResponse.json({
    contract_id: contract.contract_id,
    status: contract.status,
    visibility,
    sha256_hash: contract.sha256_hash,
    amendment_type: contract.amendment_type,
    parent_contract_hash: contract.parent_contract_hash,
    created_at: contract.created_at,
    _hint: 'Full contract text requires API key (contract creator) or share token. Use POST /api/v1/contracts/{id}/share to generate a share link.',
  });
}

export { corsOptions as OPTIONS };
