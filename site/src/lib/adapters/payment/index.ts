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
  /** x402 payment tx hash (only for x402 type) */
  txHash?: string;
  /** Delegated agent wallet (only for api_key type with delegation) */
  principalWallet?: string;
  /** Per-agent daily contract limit */
  agentDailyLimit?: number;
}
