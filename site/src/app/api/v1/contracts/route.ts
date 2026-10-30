import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createContractSchema } from '@/lib/validation/contract-schemas';
import { validateApiKey } from '@/lib/api-auth';
import { generateContract } from '@/lib/llm/generate-contract';
import {
  hashContract,
  generateContractId,
  storeContract,
  decrementCredits,
  grantCredits,
} from '@/lib/contract-engine';
import { hasEnoughCredits, insufficientCreditsBody, UNLIMITED_CREDITS } from '@/lib/credits';
import { logAudit } from '@/lib/audit';
import {
  generationUnavailableBody,
  getProviderUnavailableSeconds,
  recordGenerationFailure,
  recordGenerationSuccess,
  requestCarriesCredentials,
  type GenerationFailure,
} from '@/lib/llm/availability';
import {
  GENERATION_TIMEOUT_RETRY_AFTER_SECONDS,
  generationTimeoutBody,
  paymentStatusUnknownBody,
  pastSettleDeadline,
  publicSettleReason,
} from '@/lib/x402/settle-failure';

// 300s = Vercel Pro plan max. Kimi K2.6 generating an 8K-token Ricardian
// contract typically takes 40–80s; the prior 60s cap was killing the function
// mid-stream and returning Vercel's HTML error page, which surfaced to users
// as "Unexpected token 'A', An error o... not valid JSON" (2026-05-18).
export const maxDuration = 300;
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { authenticateRequest, buildPaymentChallenge, linkPaymentToContract } from '@/lib/x402/middleware';
import type { AuthContext } from '@/lib/adapters/payment/index';
import { corsOptions } from '@/lib/cors';
import { resolveOversight, applyThresholdToDocument } from '@/lib/compliance/oversight-gate';
import { checkAgentLimit, incrementAgentUsage } from '@/lib/agent-limits';
import { verifyMessage } from 'ethers';
import { effectivePrincipalWallet, findPartyWalletProblem } from '@/lib/contract/same-wallet';
import { nextStepAfterCreate } from '@/lib/contract/next-step';
import { accountPrincipalWallet } from '@/lib/contract/account-wallets';

const WALLET_SIG_MAX_AGE_MS = 5 * 60 * 1000;

async function verifyWalletOwnership(request: Request, wallet: string): Promise<{ valid: boolean; error?: string }> {
  const signature = request.headers.get('X-Wallet-Signature');
  const message = request.headers.get('X-Wallet-Message');

  if (!signature || !message) {
    return { valid: false, error: 'Wallet lookup requires X-Wallet-Signature and X-Wallet-Message headers to prove ownership' };
  }

  const tsMatch = message.match(/Timestamp:\s*(\d+)/);
  if (!tsMatch) {
    return { valid: false, error: 'X-Wallet-Message must contain a Timestamp field (unix ms)' };
  }

  const messageTs = parseInt(tsMatch[1], 10);
  if (Math.abs(Date.now() - messageTs) > WALLET_SIG_MAX_AGE_MS) {
    return { valid: false, error: 'Signature expired. Timestamp must be within 5 minutes of server time.' };
  }

  let recoveredAddress: string;
  try {
    recoveredAddress = verifyMessage(message, signature);
  } catch {
    return { valid: false, error: 'Signature verification failed' };
  }

  if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
    return { valid: false, error: 'Recovered address does not match wallet parameter' };
  }

  return { valid: true };
}

export async function GET(request: Request) {
  const apiCtx = await validateApiKey(request);
  const walletParam = new URL(request.url).searchParams.get('wallet');

  if (!apiCtx && !walletParam) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Valid API key required via X-API-Key header, or provide ?wallet= with signature headers' },
      { status: 401 },
    );
  }

  if (walletParam && !apiCtx) {
    const walletAuth = await verifyWalletOwnership(request, walletParam);
    if (!walletAuth.valid) {
      return NextResponse.json(
        { error: 'unauthorized', message: walletAuth.error },
        { status: 401 },
      );
    }
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const search = searchParams.get('search');
  const clientDraftId = searchParams.get('client_draft_id');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const db = getSupabaseAdmin();

  let query = db
    .from('contracts')
    .select('contract_id, status, sha256_hash, amendment_type, principal_declaration, contract_type, created_at, updated_at, payment_method, payer_wallet, visibility, client_draft_id', { count: 'exact' });

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
  // client_draft_id filter is used by the DeployChat visibility-API recovery
  // probe: when a deploy fetch was throttled by Chrome backgrounding the tab,
  // the client polls this endpoint on focus return to discover that the
  // contract was actually created server-side even though the response never
  // surfaced. The combination of api_key_id filter (above) + client_draft_id
  // means we never leak someone else's draft id; user can only find their own.
  if (clientDraftId) {
    query = query.eq('client_draft_id', clientDraftId);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'query_failed', message: 'Failed to retrieve contracts. Please try again.' },
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
      // Echoed so the client can cross-reference local IndexedDB drafts and
      // auto-prune "ghost drafts" — local drafts that succeeded server-side
      // but whose deleteDraft() never ran because the client's fetch was
      // throttled by Chrome backgrounding the tab. (2026-05-26 fix)
      client_draft_id: (c as { client_draft_id?: string }).client_draft_id ?? null,
    })),
    pagination: {
      page,
      limit,
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / limit),
    },
  });
}

/** 503 for a provider usage-limit outage: nothing was charged, retry later. */
function generationUnavailable(retryAfterSeconds: number) {
  return NextResponse.json(generationUnavailableBody(retryAfterSeconds), {
    status: 503,
    headers: { 'Retry-After': String(retryAfterSeconds) },
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
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

  // 1a. A contract nobody could sign (one wallet on both sides, or a one-sided
  // template with no signer wallet). Part of request validation, so it runs
  // before any payment is verified or credit burned.
  const walletProblem = await findPartyWalletProblem({
    template: parsed.data.template,
    principal_wallet: parsed.data.principal_wallet,
    parameters: parsed.data.parameters,
  });
  if (walletProblem) {
    return NextResponse.json(walletProblem, { status: 400 });
  }

  // 1b. Provider known to be out of quota: say so before verifying or charging
  // anything. A bare request (no key, no signature) still gets the 402 below so
  // price discovery keeps working.
  const providerDownSeconds = getProviderUnavailableSeconds();
  if (providerDownSeconds !== null && requestCarriesCredentials(request)) {
    return generationUnavailable(providerDownSeconds);
  }

  // 2. Dual auth: API key OR x402 v2 payment. An x402 payment is only VERIFIED
  // here; it settles (step 8) after the contract has been generated.
  const authResult = await authenticateRequest(request, parsed.data.template);

  if (!authResult.auth) {
    // No valid auth: 402 with PAYMENT-REQUIRED, 404 unknown_template, or 503
    // when payments are down
    if (authResult.challenge.status === 402) {
      const ip = getClientIp(request);
      const rl = rateLimit(`402:${ip}`, 10, 60_000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'rate_limited', message: 'Too many requests.' },
          { status: 429 },
        );
      }
    }

    return NextResponse.json(authResult.challenge.body, {
      status: authResult.challenge.status,
      headers: authResult.challenge.headers,
    });
  }
  let authCtx: AuthContext = authResult.auth;

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
    .select('id, slug, category, parameter_schema, is_one_sided, price_cents')
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

  // 5-pre. Check credits (API key only — x402 already paid). 1 credit = 1 cent;
  // a contract burns its template's price_cents. Fast path only: the real
  // check is the atomic burn in step 6.
  const priceCents = template.price_cents as number;
  const insufficientCredits = async (available: number) => {
    const challenge = await buildPaymentChallenge(request, parsed.data.template);
    return NextResponse.json(
      {
        ...challenge.body,
        ...insufficientCreditsBody(priceCents, available),
        message: 'Insufficient contract credits. Pay per-contract via x402 or purchase more credits at ambr.run',
      },
      { status: challenge.status, headers: challenge.headers },
    );
  };
  if (authCtx.type === 'api_key' && !hasEnoughCredits(authCtx.credits ?? 0, priceCents)) {
    return insufficientCredits(authCtx.credits ?? 0);
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

  // The response never carries upstream error text or request ids: they go to the
  // server log here and to the audit details, where the caller has them.
  const generationFailed = (failure: GenerationFailure, extra: Record<string, unknown> = {}) => {
    if (failure.unavailable) return generationUnavailable(failure.retryAfterSeconds);
    return NextResponse.json(
      {
        error: 'generation_failed',
        message: 'Failed to generate contract. Please try again.',
        ...extra,
      },
      { status: 500 },
    );
  };

  // 5b. Oversight threshold check — EU AI Act Article 14. Read-only, so it runs
  // before any money moves.
  // Lives in lib/compliance/oversight-gate.ts so the MCP/A2A door runs the
  // identical logic. It previously lived inline here and nowhere else, which
  // meant an agent creating a mandate over A2A skipped the gate entirely.
  let oversight: Awaited<ReturnType<typeof resolveOversight>>;
  try {
    oversight = await resolveOversight({
      declaredThresholdUsd: parsed.data.oversight_threshold_usd ?? null,
      parentContractHash: parsed.data.parent_contract_hash ?? null,
      parameters: parsed.data.parameters,
    });
  } catch (err) {
    console.error('Contract creation failed:', err);
    return generationFailed(recordGenerationFailure(err));
  }
  const { oversightThresholdUsd, requiresPrincipalApproval } = oversight;

  // 6. Take payment from an API key: atomic burn, before the work, so a request
  // that races the pre-check cannot get a contract for free. Refunded in the
  // catch below when generation fails. An x402 payment is NOT taken here: it
  // settles in step 8, only once the contract exists.
  let creditsRemaining: number | null = null;
  if (authCtx.type === 'api_key' && authCtx.keyId) {
    creditsRemaining = await decrementCredits(authCtx.keyId, priceCents);
    if (creditsRemaining === null) {
      return insufficientCredits(authCtx.credits ?? 0);
    }
  }

  let contractStored = false;
  let x402Settled = false;
  try {
    // 7. Generate contract via LLM (in memory: nothing is stored or settled yet)
    const contractId = await generateContractId();
    const { humanReadable, machineReadable } = await generateContract({
      templateSlug: template.slug,
      parameters: parsed.data.parameters,
      principalDeclaration: parsed.data.principal_declaration,
      contractId,
    });
    recordGenerationSuccess();

    // The threshold belongs inside the hashed document, not only in a database
    // column. The machine-readable half is what the SHA-256 commits to, so a limit
    // that lives only in a table is not part of the agreement any counterparty can
    // verify — which is the whole premise of a Ricardian contract. Written before
    // hashing, deliberately. It also feeds the inheritance read above, which looks
    // at a parent's machine_readable as well as its column.
    applyThresholdToDocument(machineReadable as Record<string, unknown>, oversightThresholdUsd);

    // 7b. Hash
    const sha256Hash = hashContract(humanReadable, machineReadable);

    // 8. x402: settle the verified payment through the facilitator, now that the
    // contract exists. If it does not settle, the generated contract is
    // discarded, nothing is stored and the payer is asked to pay again.
    if (authCtx.type === 'x402') {
      if (!authCtx.settle) {
        return NextResponse.json(
          { error: 'payment_unavailable', message: 'x402 payment could not be settled.' },
          { status: 503 },
        );
      }
      // Never settle when the function could be killed before the insert below:
      // the payer would be charged for a contract that is never stored.
      if (pastSettleDeadline(startedAt, maxDuration)) {
        await logAudit({
          event_type: 'x402_generation_failed_not_settled',
          severity: 'warn',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            payer: authCtx.payerWallet,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            template: template.slug,
            money_moved: false,
            reason: 'deadline',
            elapsed_ms: Date.now() - startedAt,
          },
        });
        return NextResponse.json(generationTimeoutBody(), {
          status: 503,
          headers: { 'Retry-After': String(GENERATION_TIMEOUT_RETRY_AFTER_SECONDS) },
        });
      }
      const settled = await authCtx.settle();
      if (!settled.ok) {
        // One audit row per settle failure. The raw reason stays here; the
        // response only ever carries a facilitator code.
        await logAudit({
          event_type: 'x402_settle_failed',
          severity: settled.ambiguous ? 'error' : 'warn',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            payer: authCtx.payerWallet,
            template: template.slug,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            reason: settled.reason,
            money_moved: settled.ambiguous ? 'unknown' : false,
            nonce: settled.nonce,
          },
        });
        // Threw, timed out, or failed with no facilitator code: funds may have
        // moved, so never tell the payer to pay again.
        if (settled.ambiguous) {
          return NextResponse.json(paymentStatusUnknownBody(settled.nonce), { status: 503 });
        }
        const challenge = await buildPaymentChallenge(request, parsed.data.template);
        const reason = publicSettleReason(settled.reason);
        return NextResponse.json(
          {
            ...challenge.body,
            error: 'payment_settlement_failed',
            message:
              'The payment did not settle and nothing was charged. Sign a fresh payment from the PAYMENT-REQUIRED header and retry.',
            ...(reason ? { reason } : {}),
          },
          { status: challenge.status, headers: challenge.headers },
        );
      }
      x402Settled = true;
      authCtx = {
        ...authCtx,
        payerWallet: settled.payerWallet,
        txHash: settled.txHash,
        paymentResponseHeaders: settled.headers,
      };
    }

    // 9. Store — status depends on threshold check
    const initialStatus = requiresPrincipalApproval ? 'awaiting_principal_approval' : 'draft';

    const contract = await storeContract({
      contractId,
      templateId: template.id,
      contractType: template.category,
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
      clientDraftId: parsed.data.client_draft_id,
      principalWallet: effectivePrincipalWallet(
        { principal_wallet: parsed.data.principal_wallet, parameters: parsed.data.parameters },
        Boolean(template.is_one_sided),
        // The creating account's wallet when the request names no principal
        // side (lib/contract/account-wallets.ts); an x402 payer has no account.
        authCtx.type === 'api_key' && authCtx.keyId && !parsed.data.principal_wallet && !template.is_one_sided
          ? await accountPrincipalWallet(authCtx.keyId, parsed.data.principal_declaration.agent_id)
          : null,
      ),
      isOneSided: Boolean(template.is_one_sided),
    });
    contractStored = true;

    // 9a. Auto-create a share token at deploy time so the deployer's reader URL
    // includes `?token=…` from the moment of creation. Without this, the
    // "Open reader portal" link from the success modal hits Metadata-Only view
    // (bare hash URL → reader requires share token OR API key auth → browser
    // navigation drops API key headers → user sees "wallet not associated"
    // even when they ARE the deployer). The share endpoint generates fresh
    // tokens for emailed counterparties; this one is for the deployer's
    // immediate-use case. 30-day expiry to match the deployer's typical
    // signing window.
    let initialShareToken: string | null = null;
    try {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const db = getSupabaseAdmin();
      const { error: tokenError } = await db.from('share_tokens').insert({
        contract_id: contract.id,
        token,
        created_by_api_key_id: authCtx.type === 'api_key' ? authCtx.keyId : null,
        expires_at: expiresAt,
        // Opens the reader for the deployer; never an invite to sign
        // (lib/contract/share-token.ts). Explicit, not left to the column default.
        purpose: 'deployer',
      });
      if (!tokenError) {
        initialShareToken = token;
      }
      // If insert failed, the deployer can still generate one via /share —
      // they just won't have the convenience URL. Don't fail the deploy.
    } catch {
      // share_tokens row failed; skip silently. Deploy still succeeds.
    }

    // Post-store steps: the contract exists, so a throw here must not turn into
    // the generation-failed 500 (and a refund path) for a contract the caller owns.
    try {
      // 10. Post-creation: link the payment (credits were burned in step 6)
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
        reader_url: initialShareToken
          ? `https://getamber.dev/reader/${contract.sha256_hash}?token=${initialShareToken}`
          : `https://getamber.dev/reader/${contract.sha256_hash}`,
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
        response.next_step = nextStepAfterCreate(Boolean(template.is_one_sided));
      }

      if (authCtx.type === 'api_key') {
        response.credits_remaining = creditsRemaining === UNLIMITED_CREDITS ? 'unlimited' : creditsRemaining ?? 0;
      }

      return NextResponse.json(response, {
        status: 201,
        headers: authCtx.paymentResponseHeaders,
      });
    } catch (postErr) {
      console.error('[contracts] post-store step failed', contract.contract_id, postErr);
      await logAudit({
        event_type: 'post_store_step_failed',
        severity: 'error',
        actor: authCtx.payerWallet ?? authCtx.keyId ?? 'unknown',
        details: {
          contract_id: contract.contract_id,
          tx_hash: authCtx.txHash,
          message: postErr instanceof Error ? postErr.message : String(postErr),
        },
      });
      return NextResponse.json(
        {
          contract_id: contract.contract_id,
          sha256_hash: contract.sha256_hash,
          status: contract.status,
          payment_method: authCtx.type,
          reader_url: `https://getamber.dev/reader/${contract.sha256_hash}`,
          sign_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/sign`,
          handshake_url: `https://getamber.dev/api/v1/contracts/${contract.contract_id}/handshake`,
          created_at: contract.created_at,
        },
        { status: 201, headers: authCtx.paymentResponseHeaders },
      );
    }
  } catch (err) {
    console.error('Contract creation failed:', err);
    const failure = recordGenerationFailure(err);
    const upstream = { error_class: failure.errorClass, error_message: failure.errorMessage.slice(0, 500) };
    // Credits were burned before generation: give them back. An x402 payment is
    // settled only after generation, so before that nothing needs refunding.
    if (!contractStored) {
      if (authCtx.type === 'api_key' && authCtx.keyId) {
        const refunded = (await grantCredits(authCtx.keyId, priceCents)) !== null;
        await logAudit({
          event_type: 'credits_refunded_generation_failed',
          severity: refunded ? 'warn' : 'error',
          actor: authCtx.keyId,
          details: { template: template.slug, credits: priceCents, refunded, ...upstream },
        });
      } else if (authCtx.type === 'x402' && x402Settled) {
        // Narrow case: the payment settled but the contract could not be stored.
        // The only path that still leaves a refund for support to make.
        await logAudit({
          event_type: 'x402_settled_no_contract',
          severity: 'error',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            tx_hash: authCtx.txHash,
            payer: authCtx.payerWallet,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            template: template.slug,
            ...upstream,
          },
        });
        return generationFailed(
          { ...failure, unavailable: false },
          {
            message:
              'The payment settled but the contract could not be stored. Support will refund the payment: quote the transaction hash.',
            payment_tx: authCtx.txHash,
          },
        );
      } else if (authCtx.type === 'x402') {
        await logAudit({
          event_type: 'x402_generation_failed_not_settled',
          severity: failure.unavailable ? 'warn' : 'error',
          actor: authCtx.payerWallet ?? 'unknown',
          details: {
            payer: authCtx.payerWallet,
            amount_usdc: authCtx.amountUsdc,
            resource: authCtx.resource,
            template: template.slug,
            money_moved: false,
            ...upstream,
          },
        });
      }
    }
    return generationFailed(failure);
  }
}

export { corsOptions as OPTIONS };
