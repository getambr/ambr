import {
  x402ResourceServer,
  x402HTTPResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RouteConfig,
} from '@x402/core/server';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from '@x402/extensions/bazaar';
import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AuthContext, SettleResult } from '@/lib/adapters/payment/index';
import { getTemplatePrice, getAllPrices } from './pricing';
import {
  createFacilitatorClient,
  resolveX402Config,
  type X402Config,
} from './facilitator';
import { logAudit } from '@/lib/audit';
import { checkVelocity } from '@/lib/velocity';
import { isDeclinedSettle } from './settle-failure';

type ReadyConfig = Extract<X402Config, { ok: true }>;

/** The HTTP answer a route should send when the request is not (yet) authenticated. */
export interface X402Challenge {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export type AuthResult =
  | { auth: AuthContext; challenge?: undefined }
  | { auth?: undefined; challenge: X402Challenge };

/** Route that is declared to the Bazaar discovery index. */
const DISCOVERABLE_PATH = '/api/v1/contracts';

/**
 * How long a signed payment stays valid for settlement, in seconds. Settlement
 * now runs after generation (LLM timeout 250 s), so it must outlast that.
 */
const MAX_TIMEOUT_SECONDS = 300;

/** Bound on one facilitator HTTP attempt, and on the whole settle call. */
const FACILITATOR_TIMEOUT_MS = 20_000;
const SETTLE_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`settle timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The EIP-3009 / Permit2 nonce of the signed authorization, to quote to support. */
function nonceOf(payload: unknown): string | undefined {
  const inner = (
    payload as {
      payload?: { authorization?: { nonce?: unknown }; permit2Authorization?: { nonce?: unknown } };
    }
  )?.payload;
  const nonce = inner?.authorization?.nonce ?? inner?.permit2Authorization?.nonce;
  return typeof nonce === 'string' ? nonce : undefined;
}

// ---------------------------------------------------------------------------
// Resource server (one per network + facilitator, initialised once)
// ---------------------------------------------------------------------------

let cached: { key: string; server: x402ResourceServer; ready: Promise<void> } | null = null;

async function getResourceServer(cfg: ReadyConfig): Promise<x402ResourceServer> {
  const key = `${cfg.network}|${cfg.facilitatorUrl}`;
  if (!cached || cached.key !== key) {
    const client = await createFacilitatorClient(cfg, { timeoutMs: FACILITATOR_TIMEOUT_MS });
    const server = new x402ResourceServer(client);
    server.register(cfg.network, new ExactEvmScheme());
    server.registerExtension(bazaarResourceServerExtension);
    const entry = { key, server, ready: server.initialize() };
    cached = entry;
    // A failed initialise (facilitator down) must not stick: retry next request.
    entry.ready.catch(() => {
      if (cached === entry) cached = null;
    });
  }
  const entry = cached;
  await entry.ready;
  return entry.server;
}

/** "$0.20" from USDC with 6 decimals. */
function formatUsdPrice(usdc6: bigint): string {
  const fixed = (Number(usdc6) / 1_000_000).toFixed(6).replace(/0+$/, '');
  const [whole, frac = ''] = fixed.split('.');
  return `$${whole}.${frac.padEnd(2, '0')}`;
}

/**
 * Bazaar listing text for DISCOVERABLE_PATH. One text for every template: the
 * catalog keeps whichever description the settling payment carried, and ranks
 * on it (CDP: at most 500 characters, what it does and when to call it).
 */
export const DISCOVERY_DESCRIPTION =
  'Ambr (ambr.run): create a Ricardian contract that an AI agent signs on behalf of its principal, a person or company. ' +
  'Call it when your agent agrees a deal with another party (an API or compute service, a purchase, a subscription, ' +
  'or a delegation of authority) and needs a signed written record. Returns legal text and machine-readable ' +
  'JSON bound by one SHA-256 hash, plus reader and sign links; the parties sign with their wallets. ' +
  'Templates: GET /api/v1/templates.';

/** Bazaar display fields (x402 ResourceInfo: name 32 chars, 5 tags of 32). */
const DISCOVERY_SERVICE_NAME = 'Ambr';
const DISCOVERY_TAGS = ['contracts', 'legal', 'agent-identity', 'ricardian', 'delegation'];
const DISCOVERY_ICON_URL = 'https://getamber.dev/icon-512.png';

function describe(templateSlug: string): string {
  return `Create Ricardian Contract (${templateSlug})`;
}

/** Unknown (or missing) template slug: rejected before any challenge is built. */
function unknownTemplate(templateSlug: string | undefined): X402Challenge {
  return {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
    body: {
      error: 'unknown_template',
      message: `Template '${templateSlug ?? ''}' not found. Use GET /api/v1/templates to list available templates.`,
    },
  };
}

/** Run `fn` at most once; later calls get the first call's result. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => (promise ??= fn());
}

function makeAdapter(request: Request, templateSlug: string): HTTPAdapter {
  const url = new URL(request.url);
  return {
    getHeader: (name) => request.headers.get(name) ?? undefined,
    getMethod: () => request.method,
    getPath: () => url.pathname,
    getUrl: () => `${url.origin}${url.pathname}`,
    getAcceptHeader: () => request.headers.get('accept') ?? '',
    getUserAgent: () => request.headers.get('user-agent') ?? '',
    // The route has already consumed the request body, so hand over the one
    // field the price depends on.
    getBody: () => ({ template: templateSlug }),
  };
}

async function humanBody(
  cfg: ReadyConfig,
  templateSlug: string,
  reason?: string,
): Promise<Record<string, unknown>> {
  return {
    error: 'payment_required',
    message:
      'Payment required. Pay with a standard x402 v2 client: read the PAYMENT-REQUIRED response header (base64 JSON), sign the payment it describes, and retry the same request with a PAYMENT-SIGNATURE header. Or authenticate with an API key (X-API-Key).',
    ...(reason ? { reason } : {}),
    x402: {
      version: 2,
      scheme: 'exact',
      network: cfg.network,
      facilitator: cfg.facilitatorUrl,
      description: describe(templateSlug),
      pricing: await getAllPrices(),
    },
  };
}

function unavailable(reason: string): X402Challenge {
  console.error(`[x402] payment unavailable: ${reason}`);
  return {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
    body: {
      error: 'payment_unavailable',
      message: 'x402 payments are not available right now. Authenticate with an API key (X-API-Key) or retry later.',
    },
  };
}

/** Discovery metadata for the contract-creation resource (Bazaar). */
const contractDiscovery = declareDiscoveryExtension({
  bodyType: 'json',
  input: {
    template: 'a1-service-purchase',
    // A body that passes validation as written: every required parameter of
    // the template, and the principal fields the schema insists on (a 0x
    // address for agent_id, a principal_type). The old placeholder was a 400.
    parameters: {
      consumer_name: 'Example Consumer',
      consumer_email: 'consumer@example.com',
      provider_name: 'Example Provider Ltd',
      provider_agent_id: '0x0000000000000000000000000000000000000002',
      service_description: 'One month of market data via API',
      fee: 20,
      currency: 'USDC',
      delivery_timeline: 'Within 24 hours of payment',
      refund_policy: 'Full refund within 14 days if not delivered',
      governing_law: 'Singapore',
    },
    principal_declaration: {
      agent_id: '0x0000000000000000000000000000000000000001',
      principal_name: 'Example Principal',
      principal_type: 'company',
    },
  },
  inputSchema: {
    properties: {
      template: { type: 'string', description: 'Template slug, see GET /api/v1/templates' },
      parameters: { type: 'object', description: 'Template parameters' },
      principal_declaration: { type: 'object', description: 'Who the agent acts for' },
      parent_contract_hash: { type: 'string', description: 'SHA-256 of a parent contract (amendments)' },
      visibility: { type: 'string', enum: ['private', 'metadata_only', 'public', 'encrypted'] },
    },
    required: ['template', 'parameters', 'principal_declaration'],
  },
  output: {
    // The 201 answer of POST /api/v1/contracts for an x402 payer.
    example: {
      contract_id: 'amb-2026-0001',
      sha256_hash: '9f2c4e8a1b7d3f6e0a5c9b2d8e4f1a7c3b6d0e9f2a5c8b1d4e7f0a3c6b9d2e5f',
      status: 'draft',
      visibility: 'private',
      require_zk_identity: false,
      payment_method: 'x402',
      reader_url:
        'https://getamber.dev/reader/9f2c4e8a1b7d3f6e0a5c9b2d8e4f1a7c3b6d0e9f2a5c8b1d4e7f0a3c6b9d2e5f?token=<share-token>',
      sign_url: 'https://getamber.dev/api/v1/contracts/amb-2026-0001/sign',
      handshake_url: 'https://getamber.dev/api/v1/contracts/amb-2026-0001/handshake',
      created_at: '2026-10-29T12:00:00.000Z',
      next_step:
        'Contract created as draft. Optionally handshake first, then both parties must sign (ECDSA) to activate.',
    },
    schema: {
      properties: {
        contract_id: { type: 'string', description: 'Ambr contract id' },
        sha256_hash: { type: 'string', description: 'SHA-256 binding the legal text and the JSON' },
        status: { type: 'string', enum: ['draft', 'awaiting_principal_approval'] },
        visibility: { type: 'string', enum: ['private', 'metadata_only', 'public', 'encrypted'] },
        require_zk_identity: { type: 'boolean' },
        payment_method: { type: 'string', enum: ['x402', 'api_key'] },
        reader_url: { type: 'string', description: 'Read the contract (carries a share token when one was issued)' },
        sign_url: { type: 'string', description: 'POST a wallet signature here' },
        handshake_url: { type: 'string', description: 'Optional counterparty handshake before signing' },
        created_at: { type: 'string', format: 'date-time' },
        next_step: { type: 'string' },
        principal_approval_required: { type: 'boolean' },
        approve_url: { type: 'string', description: 'Present when the principal must approve first' },
      },
      required: ['contract_id', 'sha256_hash', 'status', 'reader_url', 'sign_url', 'created_at'],
    },
  },
});

function buildRouteConfig(
  cfg: ReadyConfig,
  path: string,
  templateSlug: string,
): RouteConfig {
  return {
    accepts: {
      scheme: 'exact',
      network: cfg.network,
      payTo: cfg.payTo,
      price: async () => {
        const price = await getTemplatePrice(templateSlug);
        if (price === null) throw new Error(`no price for template ${templateSlug}`);
        return formatUsdPrice(price);
      },
      maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    },
    description: path === DISCOVERABLE_PATH ? DISCOVERY_DESCRIPTION : describe(templateSlug),
    mimeType: 'application/json',
    unpaidResponseBody: async () => ({
      contentType: 'application/json',
      body: await humanBody(cfg, templateSlug),
    }),
    ...(path === DISCOVERABLE_PATH
      ? {
          serviceName: DISCOVERY_SERVICE_NAME,
          tags: DISCOVERY_TAGS,
          iconUrl: DISCOVERY_ICON_URL,
          extensions: { ...contractDiscovery },
        }
      : {}),
  };
}

/** Headers of an x402 failure response, with the JSON content type forced. */
function challengeHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers, 'Content-Type': 'application/json' };
}

function reasonFromHeaders(headers: Record<string, string>): string | undefined {
  const encoded = headers['PAYMENT-REQUIRED'];
  if (!encoded) return undefined;
  try {
    return decodePaymentRequiredHeader(encoded).error;
  } catch {
    return undefined;
  }
}

function payerOf(payload: unknown): string | undefined {
  const inner = (
    payload as {
      payload?: { authorization?: { from?: unknown }; permit2Authorization?: { from?: unknown } };
    }
  )?.payload;
  const from = inner?.authorization?.from ?? inner?.permit2Authorization?.from;
  return typeof from === 'string' ? from.toLowerCase() : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate a request via API key or x402 v2 payment.
 *
 * - API key present and valid: returns the key's AuthContext.
 * - Otherwise the request must carry a PAYMENT-SIGNATURE header. Without it,
 *   or when the payment does not verify, the result is a 402 challenge with
 *   the PAYMENT-REQUIRED header. A valid payment is only VERIFIED here: the
 *   returned auth carries a `settle()` closure that moves the money (and
 *   records it in x402_payments). The route runs its cheap checks, generates
 *   the contract in memory, and only then calls `settle()` once, so a request
 *   that would be rejected or whose generation fails never costs the payer
 *   anything. The cost of that order: N concurrent copies of one signature all
 *   verify and all generate, but only one settles (the others fail on the used
 *   nonce and are discarded).
 * - An unknown or missing template slug: 404 unknown_template, no challenge.
 * - x402 not configured or the facilitator unreachable: 503 payment_unavailable
 *   (fail closed, nothing is accepted).
 */
export async function authenticateRequest(
  request: Request,
  templateSlugArg?: string,
): Promise<AuthResult> {
  const apiCtx = await validateApiKey(request);
  if (apiCtx) {
    return {
      auth: {
        type: 'api_key',
        keyId: apiCtx.keyId,
        email: apiCtx.email,
        credits: apiCtx.credits,
        tier: apiCtx.tier,
        principalWallet: apiCtx.principalWallet || undefined,
        agentDailyLimit: apiCtx.agentDailyLimit,
      },
    };
  }

  // No default price: a slug with no price is rejected before any challenge.
  if (!templateSlugArg || (await getTemplatePrice(templateSlugArg)) === null) {
    return { challenge: unknownTemplate(templateSlugArg) };
  }
  const templateSlug: string = templateSlugArg;

  const cfg = resolveX402Config();
  if (!cfg.ok) return { challenge: unavailable(cfg.reason) };

  try {
    const resourceServer = await getResourceServer(cfg);
    const adapter = makeAdapter(request, templateSlug);
    const ctx: HTTPRequestContext = { adapter, path: adapter.getPath(), method: request.method };
    const routeKey = `${request.method.toUpperCase()} ${ctx.path}`;
    const httpServer = new x402HTTPResourceServer(resourceServer, {
      [routeKey]: buildRouteConfig(cfg, ctx.path, templateSlug),
    });

    const result = await httpServer.processHTTPRequest(ctx);

    if (result.type === 'no-payment-required') {
      return { challenge: unavailable('route not registered for payment') };
    }

    if (result.type === 'payment-error') {
      const { status, headers } = result.response;
      return {
        challenge: {
          status,
          headers: challengeHeaders(headers),
          body: await humanBody(cfg, templateSlug, reasonFromHeaders(headers)),
        },
      };
    }

    // Payment verified by the facilitator. Velocity check before money moves.
    const { paymentPayload, paymentRequirements, declaredExtensions } = result;
    const amountUsd = Number(paymentRequirements.amount) / 1_000_000;
    const payerFromPayload = payerOf(paymentPayload);
    if (!payerFromPayload) {
      // Without a payer there is nothing to rate-limit against.
      logAudit({
        event_type: 'x402_payer_unknown',
        severity: 'warn',
        actor: 'unknown',
        details: { template: templateSlug },
      });
      return {
        challenge: {
          status: 402,
          headers: challengeHeaders({}),
          body: await humanBody(cfg, templateSlug, 'payer_unknown'),
        },
      };
    }
    const velocity = await checkVelocity(payerFromPayload, amountUsd);
    if (!velocity.allowed) {
      logAudit({
        event_type: 'x402_velocity_blocked',
        severity: 'error',
        actor: payerFromPayload,
        details: { reason: velocity.reason, template: templateSlug },
      });
      return {
        challenge: {
          status: 402,
          headers: challengeHeaders({}),
          body: await humanBody(cfg, templateSlug, velocity.reason ?? 'velocity_blocked'),
        },
      };
    }

    const resource = adapter.getUrl();
    const settle = once(async (): Promise<SettleResult> => {
      const nonce = nonceOf(paymentPayload);
      try {
        const settled = await withTimeout(
          httpServer.processSettlement(
            paymentPayload,
            paymentRequirements,
            declaredExtensions,
            { request: ctx },
            undefined,
            result.beforeHandlerSettlement,
          ),
          SETTLE_TIMEOUT_MS,
        );

        if (!settled.success) {
          // Audited by the door (x402_settle_failed), which also knows the amount.
          // processSettlement folds a facilitator 5xx, a timeout and a broadcast but
          // unconfirmed settlement into the same shape, some with snake_case codes.
          // Only a known pre-broadcast decline with no transaction means nothing moved.
          return {
            ok: false,
            reason: settled.errorReason ?? settled.errorMessage,
            ...(isDeclinedSettle(settled.errorReason, settled.transaction) ? {} : { ambiguous: true }),
            nonce,
            challenge: {
              status: settled.response.status,
              headers: challengeHeaders(settled.response.headers),
              body: await humanBody(cfg, templateSlug, settled.errorMessage ?? settled.errorReason),
            },
          };
        }

        const payerWallet = (settled.payer ?? payerFromPayload).toLowerCase();
        const txHash = settled.transaction;

        // A thrown insert folds into insertError: the money has moved, so never ambiguous.
        const { error: insertError } = await getSupabaseAdmin()
          .from('x402_payments')
          .insert({
            tx_hash: txHash,
            payer_wallet: payerWallet,
            amount_usdc: amountUsd,
            template_slug: templateSlug,
            chain: cfg.chain,
            network: settled.network,
            resource,
            x402_version: paymentPayload.x402Version,
            token_symbol: 'USDC',
            raw_proof: { settle: { success: true, transaction: txHash, payer: settled.payer, network: settled.network } },
          })
          .then(
            (r) => r,
            (e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }),
          );
        if (insertError) {
          // The money has moved; never block the paid request on the log row.
          console.error('[x402] failed to record payment', txHash, insertError);
          logAudit({
            event_type: 'x402_record_failed',
            severity: 'error',
            actor: payerWallet,
            details: { tx_hash: txHash, template: templateSlug, error: insertError.message },
          });
        }

        return { ok: true, txHash, payerWallet, headers: settled.headers };
      } catch (err) {
        console.error('[x402] settle threw', err);
        // A thrown or timed-out settle may still have moved funds: ambiguous.
        // The door writes the single audit row (x402_settle_failed).
        const reason = err instanceof Error ? err.message : String(err);
        return { ok: false, reason, ambiguous: true, nonce, challenge: unavailable(reason) };
      }
    });

    return {
      auth: {
        type: 'x402',
        payerWallet: payerFromPayload,
        amountUsdc: amountUsd,
        resource,
        settle,
      },
    };
  } catch (err) {
    return { challenge: unavailable(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * Build a 402 challenge for a request that has no usable payment (used when a
 * caller authenticated with an API key but has no credits left, so the answer
 * must still tell it how to pay per contract).
 */
export async function buildPaymentChallenge(
  request: Request,
  templateSlug: string,
): Promise<X402Challenge> {
  if ((await getTemplatePrice(templateSlug)) === null) return unknownTemplate(templateSlug);
  const cfg = resolveX402Config();
  if (!cfg.ok) return unavailable(cfg.reason);

  try {
    const resourceServer = await getResourceServer(cfg);
    const adapter = makeAdapter(request, templateSlug);
    // A challenge never carries a payment: hide any signature so the server
    // answers with fresh requirements instead of verifying one.
    const unsigned: HTTPAdapter = {
      ...adapter,
      getHeader: (name) =>
        name.toLowerCase() === 'payment-signature' ? undefined : adapter.getHeader(name),
    };
    const ctx: HTTPRequestContext = { adapter: unsigned, path: adapter.getPath(), method: request.method };
    const httpServer = new x402HTTPResourceServer(resourceServer, {
      [`${request.method.toUpperCase()} ${ctx.path}`]: buildRouteConfig(cfg, ctx.path, templateSlug),
    });
    const result = await httpServer.processHTTPRequest(ctx);
    if (result.type !== 'payment-error') return unavailable('no challenge produced');
    return {
      status: result.response.status,
      headers: challengeHeaders(result.response.headers),
      body: await humanBody(cfg, templateSlug),
    };
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Link an x402 payment to a created contract.
 */
export async function linkPaymentToContract(txHash: string, contractId: string): Promise<void> {
  const db = getSupabaseAdmin();
  await db
    .from('x402_payments')
    .update({ contract_id: contractId })
    .eq('tx_hash', txHash);
}
