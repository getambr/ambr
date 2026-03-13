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
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/v1/contracts/[id]/amend
 *
 * Create an amendment to an existing contract.
 * Creates a new contract linked to the original via parent_contract_hash.
 * Original contract status transitions to 'amended'.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth
  const apiCtx = await validateApiKey(request);
  if (!apiCtx) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header' },
      { status: 401 },
    );
  }

  // Rate limit
  const rl = rateLimit(`amend:${apiCtx.keyId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  // Credits
  if (apiCtx.credits === 0) {
    return NextResponse.json(
      { error: 'payment_required', message: 'No credits remaining' },
      { status: 402 },
    );
  }

  // Lookup original contract
  const db = getSupabaseAdmin();
  let query = db.from('contracts').select('id, contract_id, status, sha256_hash, template_id');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else if (/^[a-f0-9]{64}$/.test(id)) {
    query = query.eq('sha256_hash', id);
  } else {
    query = query.eq('id', id);
  }

  const { data: original, error: origError } = await query.single();

  if (origError || !original) {
    return NextResponse.json(
      { error: 'not_found', message: 'Original contract not found' },
      { status: 404 },
    );
  }

  if (original.status !== 'active') {
    return NextResponse.json(
      { error: 'invalid_state', message: `Cannot amend a contract with status '${original.status}'. Only 'active' contracts can be amended.` },
      { status: 409 },
    );
  }

  // Parse amendment body
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

  // Lookup template
  const { data: template } = await db
    .from('templates')
    .select('id, slug')
    .eq('slug', parsed.data.template)
    .eq('is_active', true)
    .single();

  if (!template) {
    return NextResponse.json(
      { error: 'not_found', message: `Template '${parsed.data.template}' not found` },
      { status: 404 },
    );
  }

  try {
    // Generate amendment contract
    const contractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: template.slug,
      parameters: parsed.data.parameters,
      principalDeclaration: parsed.data.principal_declaration,
      contractId,
    });

    const sha256Hash = hashContract(humanReadable, machineReadable);

    const contract = await storeContract({
      contractId,
      templateId: template.id,
      humanReadable,
      machineReadable,
      sha256Hash,
      principalDeclaration: parsed.data.principal_declaration,
      parameters: parsed.data.parameters,
      apiKeyId: apiCtx.keyId,
      parentContractHash: original.sha256_hash,
      amendmentType: 'amendment',
    });

    await decrementCredits(apiCtx.keyId, apiCtx.credits);

    // Transition original to 'amended'
    await db
      .from('contracts')
      .update({ status: 'amended' })
      .eq('id', original.id);

    // Audit log for both
    await db.from('audit_log').insert([
      {
        contract_id: original.id,
        action: 'amended',
        actor: apiCtx.email,
        details: { amended_by: contract.contract_id, new_hash: sha256Hash },
      },
      {
        contract_id: contract.id,
        action: 'created',
        actor: apiCtx.email,
        details: { parent_contract: original.contract_id, amendment_type: 'amendment' },
      },
    ]);

    return NextResponse.json(
      {
        contract_id: contract.contract_id,
        sha256_hash: contract.sha256_hash,
        status: contract.status,
        parent_contract_id: original.contract_id,
        parent_contract_hash: original.sha256_hash,
        reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
        credits_remaining: apiCtx.credits === -1 ? 'unlimited' : apiCtx.credits - 1,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: 'generation_failed', message: 'Failed to generate amendment contract' },
      { status: 500 },
    );
  }
}
