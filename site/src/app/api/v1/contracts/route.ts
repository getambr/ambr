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
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { authenticateRequest, buildPaymentRequired, linkPaymentToContract } from '@/lib/x402/middleware';
import type { AuthContext } from '@/lib/adapters/payment/index';
import { corsOptions } from '@/lib/cors';
import { checkAgentLimit, incrementAgentUsage } from '@/lib/agent-limits';

export async function GET(request: Request) {
  // Auth — API key for listing (x402 users query by wallet via separate param)
  const apiCtx = await validateApiKey(request);
  const walletParam = new URL(request.url).searchParams.get('wallet');

  if (!apiCtx && !walletParam) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header, or provide ?wallet= query parameter' },
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
    .select('contract_id, status, sha256_hash, amendment_type, principal_declaration, contract_type, created_at, updated_at, payment_method, payer_wallet, visibility', { count: 'exact' });

  // Filter by owner: API key OR wallet
  if (apiCtx && walletParam) {
    query = query.or(`api_key_id.eq.${apiCtx.keyId},payer_wallet.eq.${walletParam.toLowerCase()}`);
  } else if (apiCtx) {
    query = query.eq('api_key_id', apiCtx.keyId);
  } else if (walletParam) {
    query = query.eq('payer_wallet', walletParam.toLowerCase());
  }

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
      visibility: c.visibility,
      payment_method: c.payment_method,
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
  // 1. Parse body first (need template slug for x402 pricing)
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

  // 2. Dual auth: API key OR x402 payment
  const authCtx: AuthContext | null = await authenticateRequest(request, parsed.data.template);

  if (!authCtx) {
    // No valid auth — return 402 with pricing
    const ip = getClientIp(request);
    const rl = rateLimit(`402:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many requests.' },
        { status: 429 },
      );
    }

    const paymentInfo = await buildPaymentRequired(parsed.data.template);
    return NextResponse.json(paymentInfo, { status: 402 });
  }

  // 3. Rate limit by auth identity
  const rlKey = authCtx.type === 'api_key'
    ? `contracts:${authCtx.keyId}`
    : `contracts:${authCtx.payerWallet}`;
  const rl = rateLimit(rlKey, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Limit: 10/min.', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  // 4. Check credits (API key only — x402 already paid)
  if (authCtx.type === 'api_key' && authCtx.credits === 0) {
    const paymentInfo = await buildPaymentRequired(parsed.data.template);
    return NextResponse.json(
      {
        ...paymentInfo,
        message: 'No contract credits remaining. Pay per-contract via x402 or purchase more credits at ambr.run',
      },
      { status: 402 },
    );
  }

  // 4b. Per-agent daily limit (delegated agents only)
  if (authCtx.type === 'api_key' && authCtx.principalWallet) {
    const agentCheck = await checkAgentLimit(
      authCtx.keyId!,
      authCtx.principalWallet,
      authCtx.agentDailyLimit ?? 10,
    );
    if (!agentCheck.allowed) {
      return NextResponse.json(
        {
          error: 'agent_limit_exceeded',
          message: `Agent daily limit reached (${agentCheck.used}/${agentCheck.limit}). Resets at midnight UTC.`,
          used: agentCheck.used,
          limit: agentCheck.limit,
        },
        { status: 429 },
      );
    }
  }

  // 5. Lookup template (include parameter_schema for validation)
  const db = getSupabaseAdmin();
  const { data: template } = await db
    .from('templates')
    .select('id, slug, parameter_schema')
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

  // 5a. Validate parameters against template's JSON Schema.
  // Checks required fields are present and non-empty. This prevents
  // incomplete parameters from reaching the LLM (which would hallucinate
  // missing values or return unclear errors).
  const schema = template.parameter_schema as { required?: string[] } | null;
  if (schema?.required && Array.isArray(schema.required)) {
    const params = parsed.data.parameters;
    const missing = schema.required.filter(
      (key: string) => params[key] === undefined || params[key] === null || params[key] === '',
    );
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'invalid_parameters',
          message: `Missing required parameters for template '${template.slug}': ${missing.join(', ')}`,
          required: schema.required,
          missing,
        },
        { status: 400 },
      );
    }
  }

  try {
    // 5b. Oversight threshold check — EU AI Act Article 14
    // If parent delegation contract has a threshold, and this contract's value exceeds it,
    // the contract requires principal approval before proceeding.
    let requiresPrincipalApproval = false;
    let oversightThresholdUsd: number | null = null;

    if (parsed.data.parent_contract_hash) {
      const { data: parentContract } = await db
        .from('contracts')
        .select('machine_readable, oversight_threshold_usd, status')
        .eq('sha256_hash', parsed.data.parent_contract_hash)
        .eq('status', 'active')
        .single();

      if (parentContract) {
        // Check explicit threshold on parent delegation
        const threshold = parentContract.oversight_threshold_usd
          ?? (parentContract.machine_readable as Record<string, unknown>)?.oversight_threshold_usd;

        if (threshold != null) {
          oversightThresholdUsd = Number(threshold);
          // Extract transaction value from parameters
          const txValue = Number(
            parsed.data.parameters.value_usd
            ?? parsed.data.parameters.spending_limit_per_tx
            ?? parsed.data.parameters.amount
            ?? 0,
          );

          if (txValue > oversightThresholdUsd) {
            requiresPrincipalApproval = true;
          }
        }
      }
    }

    // 6. Generate contract via LLM
    const contractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: template.slug,
      parameters: parsed.data.parameters,
      principalDeclaration: parsed.data.principal_declaration,
      contractId,
    });

    // 7. Hash
    const sha256Hash = hashContract(humanReadable, machineReadable);

    // 8. Store — status depends on threshold check
    const initialStatus = requiresPrincipalApproval ? 'awaiting_principal_approval' : 'draft';

    const contract = await storeContract({
      contractId,
      templateId: template.id,
      humanReadable,
      machineReadable,
      sha256Hash,
      principalDeclaration: parsed.data.principal_declaration,
      parameters: parsed.data.parameters,
      apiKeyId: authCtx.type === 'api_key' ? authCtx.keyId! : undefined,
      payerWallet: authCtx.type === 'x402' ? authCtx.payerWallet : undefined,
      paymentMethod: authCtx.type,
      visibility: parsed.data.visibility,
      parentContractHash: parsed.data.parent_contract_hash,
      amendmentType: parsed.data.amendment_type,
      initialStatus,
      oversightThresholdUsd,
      principalApprovalRequired: requiresPrincipalApproval,
      requireZkIdentity: parsed.data.require_zk_identity,
    });

    // 9. Post-creation: deduct credits or link payment
    if (authCtx.type === 'api_key' && authCtx.keyId) {
      await decrementCredits(authCtx.keyId, authCtx.credits!);
    }
    if (authCtx.type === 'x402' && authCtx.txHash) {
      await linkPaymentToContract(authCtx.txHash, contract.id);
    }
    // Track agent usage for delegated agents
    if (authCtx.type === 'api_key' && authCtx.principalWallet && authCtx.keyId) {
      await incrementAgentUsage(authCtx.keyId, authCtx.principalWallet);
    }

    const response: Record<string, unknown> = {
      contract_id: contract.contract_id,
      sha256_hash: contract.sha256_hash,
      status: contract.status,
      visibility: parsed.data.visibility || 'private',
      require_zk_identity: parsed.data.require_zk_identity || false,
      payment_method: authCtx.type,
      reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
      sign_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/sign`,
      handshake_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/handshake`,
      created_at: contract.created_at,
    };

    if (requiresPrincipalApproval) {
      response.status = 'awaiting_principal_approval';
      response.principal_approval_required = true;
      response.oversight_threshold_usd = oversightThresholdUsd;
      response.approve_url = `https://getamber.dev/api/v1/contracts/${contract.contract_id}/approve`;
      response.next_step = `Transaction exceeds oversight threshold ($${oversightThresholdUsd}). Principal must approve before contract can proceed. POST to approve_url with principal wallet signature.`;
    } else {
      response.next_step = 'Contract created as draft. Optionally handshake first, then both parties must sign (ECDSA) to activate.';
    }

    if (authCtx.type === 'api_key') {
      response.credits_remaining = authCtx.credits === -1 ? 'unlimited' : authCtx.credits! - 1;
    }

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error('Contract creation failed:', err);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Failed to generate contract. Please try again.' },
      { status: 500 },
    );
  }
}

export { corsOptions as OPTIONS };
