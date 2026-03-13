import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey } from '@/lib/api-auth';

/**
 * POST /api/v1/contracts/[id]/share
 *
 * Generate a time-limited share token for a contract.
 * Allows lawyers, auditors, or counterparties to view the full contract
 * without needing an API key or wallet connection.
 *
 * Auth: API key (must be the contract creator).
 * Body: { expires_in_hours?: number } (default: 168 = 7 days, max: 8760 = 1 year)
 */

const DEFAULT_EXPIRY_HOURS = 168; // 7 days
const MAX_EXPIRY_HOURS = 8760; // 1 year

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'API key required (X-API-Key header)' },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();

  // Lookup contract
  let query = db.from('contracts').select('id, contract_id, sha256_hash, api_key_id');
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

  // Only the contract creator can generate share tokens
  if (contract.api_key_id !== apiCtx.keyId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the contract creator can generate share links' },
      { status: 403 },
    );
  }

  // Parse expiry
  const body = await request.json().catch(() => ({}));
  const expiresInHours = Math.min(
    Math.max(1, body.expires_in_hours ?? DEFAULT_EXPIRY_HOURS),
    MAX_EXPIRY_HOURS,
  );

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await db.from('share_tokens').insert({
    contract_id: contract.id,
    token,
    created_by_api_key_id: apiCtx.keyId,
    expires_at: expiresAt,
  });

  if (insertError) {
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to create share token' },
      { status: 500 },
    );
  }

  const shareUrl = `https://getamber.dev/reader/${contract.sha256_hash}?token=${token}`;

  return NextResponse.json({
    share_url: shareUrl,
    token,
    contract_id: contract.contract_id,
    expires_at: expiresAt,
    expires_in_hours: expiresInHours,
  });
}
