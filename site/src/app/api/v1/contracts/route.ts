import { NextResponse } from 'next/server';
import { createContractSchema } from '@/lib/validation/contract-schemas';
import { validateApiKey } from '@/lib/api-auth';
import { generateContract } from '@/lib/llm/generate-contract';
import {
  hashContract,
  generateContractId,
  storeContract,
  decrementCredits,
} from '@/lib/contract-engine';

export const maxDuration = 60;
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  // Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header' },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const db = getSupabaseAdmin();

  let query = db
    .from('contracts')
    .select('contract_id, status, sha256_hash, amendment_type, principal_declaration, contract_type, created_at, updated_at', { count: 'exact' })
    .eq('api_key_id', apiCtx.keyId);

  if (status) query = query.eq('status', status);
  if (type) query = query.eq('contract_type', type);
  if (search) {
    query = query.or(`contract_id.ilike.%${search}%,principal_declaration->>principal_name.ilike.%${search}%`);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'query_failed', message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    contracts: (data ?? []).map((c) => ({
      contract_id: c.contract_id,
      status: c.status,
      sha256_hash: c.sha256_hash,
      contract_type: c.contract_type,
      amendment_type: c.amendment_type,
      principal_name: (c.principal_declaration as Record<string, unknown>)?.principal_name,
      created_at: c.created_at,
      reader_url: `https://getamber.dev/reader/${c.sha256_hash}`,
    })),
    pagination: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  });
}

export async function POST(request: Request) {
  // 1. Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header' },
      { status: 401 },
    );
  }

  // 1b. Rate limit: 10 requests/min per API key
  const rl = rateLimit(`contracts:${apiCtx.keyId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Limit: 10/min.', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  // 2. Check credits
  if (apiCtx.credits === 0) {
    return NextResponse.json(
      {
        error: 'payment_required',
        message: 'No contract credits remaining. Purchase more at ambr.run',
        wallet: process.env.NEXT_PUBLIC_WALLET_ADDRESS,
        network: 'Base L2',
        currency: 'USDC',
        tiers: {
          starter: { price: 29, credits: 50 },
          builder: { price: 99, credits: 250 },
          enterprise: { price: 299, credits: -1 },
        },
      },
      { status: 402 },
    );
  }

  // 3. Parse + validate
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = createContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.issues },
      { status: 400 },
    );
  }

  // 4. Lookup template
  const db = getSupabaseAdmin();
  const { data: template } = await db
    .from('templates')
    .select('id, slug')
    .eq('slug', parsed.data.template)
    .eq('is_active', true)
    .single();

  if (!template) {
    return NextResponse.json(
      {
        error: 'not_found',
        message: `Template '${parsed.data.template}' not found. Use GET /api/v1/templates to list available templates.`,
      },
      { status: 404 },
    );
  }

  try {
    // 5. Generate contract via LLM
    const contractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: template.slug,
      parameters: parsed.data.parameters,
      principalDeclaration: parsed.data.principal_declaration,
      contractId,
    });

    // 6. Hash
    const sha256Hash = hashContract(humanReadable, machineReadable);

    // 7. Store
    const contract = await storeContract({
      contractId,
      templateId: template.id,
      humanReadable,
      machineReadable,
      sha256Hash,
      principalDeclaration: parsed.data.principal_declaration,
      parameters: parsed.data.parameters,
      apiKeyId: apiCtx.keyId,
      parentContractHash: parsed.data.parent_contract_hash,
      amendmentType: parsed.data.amendment_type,
    });

    // 8. Decrement credits
    await decrementCredits(apiCtx.keyId, apiCtx.credits);

    return NextResponse.json(
      {
        contract_id: contract.contract_id,
        sha256_hash: contract.sha256_hash,
        status: contract.status,
        reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
        sign_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/sign`,
        created_at: contract.created_at,
        credits_remaining: apiCtx.credits === -1 ? 'unlimited' : apiCtx.credits - 1,
        next_step: 'Contract created as draft. Both parties must sign (ECDSA) to activate.',
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Contract creation failed:', err);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Failed to generate contract. Please try again.' },
      { status: 500 },
    );
  }
}
