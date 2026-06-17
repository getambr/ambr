/**
 * Ambr Agent SDK — the drop-in "agent agreement" primitive.
 *
 * Lets any agent (x402, AP2, MCP, or plain HTTP) attach a readable, signed,
 * on-chain Ricardian agreement to a transaction in a few lines. Zero runtime
 * dependencies — uses the global `fetch` and a caller-supplied signer, so it
 * runs in Node, Bun, Deno, or the edge.
 *
 * Wraps the public Ambr REST API:
 *   POST /api/v1/contracts                 → create an agreement
 *   GET  /api/v1/contracts/{id}/status     → read status + binding terms
 *   POST /api/v1/contracts/{id}/sign       → sign (ECDSA) to activate + mint
 *
 * Auth: pass an API key (instant free dev key from ambr.run → Activate →
 * Developer), or leave it unset to drive the x402 pay-per-agreement flow — an
 * unpaid create returns 402 with payment requirements, surfaced here as
 * PaymentRequiredError; attach your x402 payment header via `extraHeaders`
 * and retry.
 */

const DEFAULT_BASE_URL = 'https://getamber.dev';

export type Visibility = 'private' | 'metadata_only' | 'public' | 'encrypted';
export type PrincipalType = 'company' | 'individual';

export interface PrincipalDeclaration {
  /** The agent's wallet address (0x + 40 hex). */
  agentId: string;
  /** Legal name of the principal authorizing the agent. */
  principalName: string;
  principalType: PrincipalType;
}

export interface CreateAgreementInput {
  /** Template slug — list available slugs via GET /api/v1/templates. */
  template: string;
  /** Template parameters (scope, spend limits, parties, …). */
  parameters: Record<string, unknown>;
  /** Who is authorizing whom. */
  principal: PrincipalDeclaration;
  visibility?: Visibility;
  /** Deployer's connected wallet — lets the principal sign their own agreement. */
  principalWallet?: string;
  /** For amendments/extensions: the parent agreement's sha256 hash. */
  parentContractHash?: string;
  amendmentType?: 'original' | 'amendment' | 'extension';
  requireZkIdentity?: boolean;
  /** Idempotency / cross-reference key for your side. */
  clientDraftId?: string;
}

export interface Agreement {
  contractId: string;
  hash: string;
  status: string;
  visibility: string;
  paymentMethod: string;
  readerUrl: string;
  signUrl: string;
  handshakeUrl: string;
  createdAt: string;
  nextStep?: string;
  creditsRemaining?: number | 'unlimited';
}

export interface AgreementStatus {
  contractId: string;
  status: string;
  isCurrentlyValid: boolean;
  isExpired: boolean;
  visibility: string;
  hash: string;
  signatureCount: number;
  revokedAt: string | null;
  expiryDate: string | null;
  /** Machine-readable binding terms (what the agent may/may not do), when visible. */
  bindingTerms?: unknown;
  readerUrl?: string;
  /** Raw response, for fields not surfaced above. */
  raw: Record<string, unknown>;
}

export interface SignResult {
  contractId: string;
  signer: string;
  status: string;
  message: string;
  nftMintStatus?: string;
  nftMetadataUrl?: string;
}

/**
 * Signs an arbitrary message string with the signer's key, returning the
 * 0x-prefixed ECDSA signature. Bring your own: ethers `wallet.signMessage`,
 * viem `account.signMessage`, or a MetaMask `personal_sign`.
 */
export type MessageSigner = (message: string) => Promise<string> | string;

export interface SignOptions {
  /** The signer's wallet address (must match the address recovered from the signature). */
  walletAddress: string;
  signMessage: MessageSigner;
  /** Optional — if set, the signer is emailed an account-activation link. */
  signerEmail?: string;
}

/** Thrown when create() hits the x402 path with no API key/credits. Carries
 *  the server's payment requirements so the caller can pay and retry. */
export class PaymentRequiredError extends Error {
  readonly status = 402;
  readonly paymentInfo: unknown;
  constructor(paymentInfo: unknown) {
    super('Payment required (x402): no API key or credits. Attach an x402 payment header and retry.');
    this.name = 'PaymentRequiredError';
    this.paymentInfo = paymentInfo;
  }
}

/** Thrown for any non-2xx (other than 402) Ambr API response. */
export class AmbrApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message?: unknown }).message)
        : `Ambr API error (${status})`;
    super(msg);
    this.name = 'AmbrApiError';
    this.status = status;
    this.body = body;
  }
}

export interface AmbrClientOptions {
  /** Instant free dev key from ambr.run → Activate → Developer. */
  apiKey?: string;
  /** Defaults to https://getamber.dev. */
  baseUrl?: string;
  /** Inject a fetch implementation (tests, custom runtimes). Defaults to global fetch. */
  fetch?: typeof fetch;
}

export class AmbrClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AmbrClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const f = options.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error('No fetch implementation available on this runtime. Pass options.fetch.');
    }
    this.fetchImpl = f;
  }

  /**
   * Create a readable agreement (returns its hash + reader URL). Throws
   * PaymentRequiredError on the x402 path when no API key/credits are present.
   */
  async createAgreement(
    input: CreateAgreementInput,
    opts: { extraHeaders?: Record<string, string> } = {},
  ): Promise<Agreement> {
    const body: Record<string, unknown> = {
      template: input.template,
      parameters: input.parameters,
      principal_declaration: {
        agent_id: input.principal.agentId,
        principal_name: input.principal.principalName,
        principal_type: input.principal.principalType,
      },
    };
    if (input.visibility) body.visibility = input.visibility;
    if (input.principalWallet) body.principal_wallet = input.principalWallet;
    if (input.parentContractHash) body.parent_contract_hash = input.parentContractHash;
    if (input.amendmentType) body.amendment_type = input.amendmentType;
    if (input.requireZkIdentity != null) body.require_zk_identity = input.requireZkIdentity;
    if (input.clientDraftId) body.client_draft_id = input.clientDraftId;

    const res = await this.fetchImpl(`${this.baseUrl}/api/v1/contracts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
        ...(opts.extraHeaders ?? {}),
      },
      body: JSON.stringify(body),
    });

    const json = await this.parseJson(res);
    if (res.status === 402) throw new PaymentRequiredError(json);
    if (!res.ok) throw new AmbrApiError(res.status, json);

    const d = json as Record<string, unknown>;
    return {
      contractId: String(d.contract_id),
      hash: String(d.sha256_hash),
      status: String(d.status),
      visibility: String(d.visibility),
      paymentMethod: String(d.payment_method),
      readerUrl: String(d.reader_url),
      signUrl: String(d.sign_url),
      handshakeUrl: String(d.handshake_url),
      createdAt: String(d.created_at),
      nextStep: d.next_step != null ? String(d.next_step) : undefined,
      creditsRemaining: d.credits_remaining as number | 'unlimited' | undefined,
    };
  }

  /**
   * Read an agreement's live status + binding terms. Public — no auth needed,
   * though passing the owner API key unstrips private fields.
   */
  async getStatus(idOrHash: string): Promise<AgreementStatus> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/v1/contracts/${encodeURIComponent(idOrHash)}/status`,
      { headers: { ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}) } },
    );
    const json = await this.parseJson(res);
    if (!res.ok) throw new AmbrApiError(res.status, json);

    const d = json as Record<string, unknown>;
    return {
      contractId: String(d.contract_id),
      status: String(d.status),
      isCurrentlyValid: Boolean(d.is_currently_valid),
      isExpired: Boolean(d.is_expired),
      visibility: String(d.visibility),
      hash: String(d.sha256_hash),
      signatureCount: Number(d.signature_count ?? 0),
      revokedAt: (d.revoked_at as string | null) ?? null,
      expiryDate: (d.expiry_date as string | null) ?? null,
      bindingTerms: d.binding_terms,
      readerUrl: d.reader_url != null ? String(d.reader_url) : undefined,
      raw: d,
    };
  }

  /**
   * Sign an agreement (ECDSA). Resolves the agreement's hash, builds a signing
   * message that embeds it (the sign endpoint requires this), calls your
   * signer, and submits. A first signature moves draft → pending_signature
   * (or → active for one-sided templates); a counterparty signature activates
   * the agreement and mints the paired cNFT.
   */
  async sign(idOrHash: string, opts: SignOptions): Promise<SignResult> {
    const hash = /^[a-f0-9]{64}$/.test(idOrHash)
      ? idOrHash
      : (await this.getStatus(idOrHash)).hash;

    const message = buildSignMessage(idOrHash, hash);
    const signature = await opts.signMessage(message);

    const res = await this.fetchImpl(
      `${this.baseUrl}/api/v1/contracts/${encodeURIComponent(idOrHash)}/sign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: opts.walletAddress,
          signature,
          message,
          ...(opts.signerEmail ? { signer_email: opts.signerEmail } : {}),
        }),
      },
    );
    const json = await this.parseJson(res);
    if (!res.ok) throw new AmbrApiError(res.status, json);

    const d = json as Record<string, unknown>;
    return {
      contractId: String(d.contract_id),
      signer: String(d.signer),
      status: String(d.status),
      message: String(d.message),
      nftMintStatus: d.nft_mint_status != null ? String(d.nft_mint_status) : undefined,
      nftMetadataUrl: d.nft_metadata_url != null ? String(d.nft_metadata_url) : undefined,
    };
  }

  private async parseJson(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // Non-JSON body (e.g. an upstream HTML error page). Surface a clean error.
      throw new AmbrApiError(res.status, { message: text.slice(0, 200) });
    }
  }
}

/**
 * Builds the ECDSA signing message. The Ambr sign endpoint requires the message
 * to embed the contract's sha256 hash; the timestamp adds replay context.
 * Exported so callers can preview exactly what they are signing.
 */
export function buildSignMessage(idOrContractId: string, sha256Hash: string): string {
  return [
    'Ambr agreement signature',
    `Contract: ${idOrContractId}`,
    `Hash: ${sha256Hash}`,
    `Timestamp: ${Date.now()}`,
  ].join('\n');
}

// x402 agreement extension — attach an Ambr agreement to a 402 handshake.
export * from './x402';
