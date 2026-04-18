import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildNftMetadata } from '@/lib/chain/cnft-metadata';
import { corsOptions } from '@/lib/cors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: 'Invalid hash' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: contract } = await db
    .from('contracts')
    .select('contract_id, sha256_hash, contract_type, amendment_type, principal_declaration, nft_token_id, visibility')
    .eq('sha256_hash', hash)
    .single();

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const visibility = (contract.visibility as string) || 'private';
  const redactPrincipal = visibility === 'private' || visibility === 'encrypted';

  const metadataContract = redactPrincipal
    ? { ...contract, principal_declaration: { principal_name: 'Redacted' } }
    : contract;

  const metadata = buildNftMetadata(metadataContract);

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export { corsOptions as OPTIONS };
