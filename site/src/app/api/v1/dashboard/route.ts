import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();

  // Fetch user's contracts (most recent first, limit 50)
  const { data: contracts } = await db
    .from('contracts')
    .select('contract_id, status, amendment_type, sha256_hash, created_at, template_id, principal_declaration')
    .eq('api_key_id', auth.keyId)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    user: {
      email: auth.email,
      tier: auth.tier,
      credits: auth.credits,
      key_prefix: 'amb_****',
    },
    contracts: contracts || [],
  });
}
