/**
 * Payment Adapter Interface — pluggable payment backends for Ambr.
 *
 * Adapters: x402 (Phase 1), USDC direct (existing), Stripe/Polar (future)
 */

export interface PaymentResult {
  valid: boolean;
  amount: bigint;
  currency: string;
  payer_wallet: string;
  tx_hash?: string;
  method: 'x402' | 'usdc_direct' | 'api_key';
  error?: string;
}

export interface PaymentChallenge {
  version: string;
  price: string;
  currency: string;
  chain: string;
  recipient: string;
  description: string;
  accepts: string[];
}

export interface PaymentAdapter {
  name: string;
  /** Returns PaymentResult if this adapter handled the request, null if not applicable */
  verify(request: Request): Promise<PaymentResult | null>;
  /** Generate a payment challenge for 402 responses */
  generateChallenge(amount: bigint, description: string): PaymentChallenge;
}

/** Outcome of settling a verified x402 payment. */
export type SettleResult =
  | {
      ok: true;
      txHash: string;
      payerWallet: string;
      /** PAYMENT-RESPONSE header to echo on the paid response */
      headers: Record<string, string>;
    }
  | {
      ok: false;
      /** Why it did not settle (facilitator reason or thrown message), for the audit row */
      reason?: string;
      /**
       * The settle call threw, timed out, or failed with no facilitator code, so
       * funds may have moved. The door must not tell the payer to pay again.
       */
      ambiguous?: boolean;
      /** Authorization nonce, for the audit row and for support */
      nonce?: string;
      /** The 402 answer to send; the payment did not settle */
      challenge: { status: number; headers: Record<string, string>; body: Record<string, unknown> };
    };

/**
 * Auth context returned after successful authentication.
 * Either from API key (existing) or x402 payment (new).
 */
export interface AuthContext {
  type: 'api_key' | 'x402';
  /** API key ID (only for api_key type) */
  keyId?: string;
  /** Payer wallet address (only for x402 type) */
  payerWallet?: string;
  /** Email (only for api_key type) */
  email?: string;
  /** Credits remaining (only for api_key type, -1 = unlimited) */
  credits?: number;
  /** Tier (only for api_key type) */
  tier?: string;
  /** x402 payment tx hash (only for x402 type; set once the payment has settled) */
  txHash?: string;
  /** USDC amount of the verified x402 payment (only for x402 type) */
  amountUsdc?: number;
  /** Resource URL the x402 payment was made for (only for x402 type) */
  resource?: string;
  /**
   * x402 only: the payment is VERIFIED but NOT settled. The route runs its
   * cheap checks, generates the contract, and only then calls this; it moves
   * the money once (repeat calls return the first result).
   */
  settle?: () => Promise<SettleResult>;
  /** PAYMENT-RESPONSE header to echo on the paid response (only for x402 type) */
  paymentResponseHeaders?: Record<string, string>;
  /** Delegated agent wallet (only for api_key type with delegation) */
  principalWallet?: string;
  /** Per-agent daily contract limit */
  agentDailyLimit?: number;
}
