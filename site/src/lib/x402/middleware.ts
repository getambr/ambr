import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AuthContext } from '@/lib/adapters/payment/index';
import { getTemplatePrice, getAllPrices } from './pricing';
import {
  SUPPORTED_TOKENS,
  SUPPORTED_ADDRESSES,
  TOKEN_MAP,
  tokenAmountToUnits,
} from './tokens';
import { getTokenPriceUsd, calculateUsdValue } from './oracle';
import { logAudit } from '@/lib/audit';
import { checkVelocity } from '@/lib/velocity';

const BASE_RPC = 'https://mainnet.base.org';
const WALLET_ADDRESS = (process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? '').toLowerCase();
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Authenticate a request via API key or x402 payment.
 * Returns AuthContext if authenticated, null if payment required.
 */
export async function authenticateRequest(
  request: Request,
  templateSlug?: string,
): Promise<AuthContext | null> {
  // 1. Try API key first
  const apiCtx = await validateApiKey(request);
  if (apiCtx) {
    return {
      type: 'api_key',
      keyId: apiCtx.keyId,
      email: apiCtx.email,
      credits: apiCtx.credits,
      tier: apiCtx.tier,
      principalWallet: apiCtx.principalWallet || undefined,
      agentDailyLimit: apiCtx.agentDailyLimit,
    };
  }

  // 2. Try x402 payment proof
  const paymentHeader = request.headers.get('x-payment') || request.headers.get('X-Payment');
  if (!paymentHeader) return null;

  // Parse x402 payment proof (tx hash on Base)
  let txHash: string;
  try {
    if (paymentHeader.startsWith('{')) {
      const parsed = JSON.parse(paymentHeader);
      txHash = parsed.tx_hash || parsed.txHash || parsed.hash;
    } else {
      txHash = paymentHeader.trim();
    }

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return null;
    }
  } catch {
    return null;
  }

  // 3. Atomic claim: prevent replay
  const db = getSupabaseAdmin();
  const requiredAmountUsdc6 = templateSlug ? await getTemplatePrice(templateSlug) : 3_000000n;
  const requiredUsd = Number(requiredAmountUsdc6) / 1_000_000;

  const { error: claimError } = await db
    .from('x402_payments')
    .insert({
      tx_hash: txHash,
      payer_wallet: 'pending',
      amount_usdc: 0,
      template_slug: templateSlug || 'unknown',
      chain: 'base',
    })
    .select('id')
    .single();

  if (claimError) {
    const { data: existing } = await db
      .from('x402_payments')
      .select('id, payer_wallet, contract_id')
      .eq('tx_hash', txHash)
      .single();

    if (existing?.contract_id) return null;

    if (existing?.payer_wallet && existing.payer_wallet !== 'pending') {
      return {
        type: 'x402',
        payerWallet: existing.payer_wallet,
        txHash,
      };
    }
    return null;
  }

  // 4. Verify on-chain (any supported token or native ETH)
  const verification = await verifyX402Payment(txHash, requiredUsd);

  if (!verification.valid) {
    await db.from('x402_payments').delete().eq('tx_hash', txHash);
    logAudit({
      event_type: 'x402_payment_rejected',
      severity: 'warn',
      actor: txHash,
      details: { template: templateSlug, error: verification.error },
    });
    return null;
  }

  // Velocity check on payer wallet
  if (verification.from) {
    const velocity = await checkVelocity(verification.from, verification.usdValue || 0);
    if (!velocity.allowed) {
      await db.from('x402_payments').delete().eq('tx_hash', txHash);
      logAudit({
        event_type: 'x402_velocity_blocked',
        severity: 'error',
        actor: verification.from,
        details: { reason: velocity.reason, tx_hash: txHash, template: templateSlug },
      });
      return null;
    }
  }

  // 5. Update claim with real data
  await db
    .from('x402_payments')
    .update({
      payer_wallet: verification.from!,
      amount_usdc: verification.usdValue!,
      token_symbol: verification.tokenSymbol,
    })
    .eq('tx_hash', txHash);

  return {
    type: 'x402',
    payerWallet: verification.from!,
    txHash,
  };
}

/**
 * Build a 402 Payment Required response body.
 */
export async function buildPaymentRequired(templateSlug?: string): Promise<{
  error: string;
  message: string;
  x402: {
    version: string;
    price?: string;
    currency: string;
    chain: string;
    recipient: string;
    description: string;
    accepts: string[];
    accepted_tokens: { symbol: string; address: string; decimals: number; stable: boolean }[];
    pricing: Record<string, string>;
  };
}> {
  const price = templateSlug ? await getTemplatePrice(templateSlug) : undefined;
  const allPrices = await getAllPrices();

  const tokenSymbols = SUPPORTED_TOKENS.map((t) => t.symbol).join(', ');

  return {
    error: 'payment_required',
    message: `Payment required. Send a supported token (${tokenSymbols}) on Base to the recipient address, then retry with X-Payment header containing the tx hash.`,
    x402: {
      version: '2',
      price: price ? price.toString() : undefined,
      currency: 'USD',
      chain: 'base',
      recipient: process.env.NEXT_PUBLIC_WALLET_ADDRESS || '',
      description: templateSlug
        ? `Create Ricardian Contract (${templateSlug})`
        : 'Create Ricardian Contract',
      accepts: ['exact', 'overpay'],
      accepted_tokens: SUPPORTED_TOKENS.map((t) => ({
        symbol: t.symbol,
        address: t.native ? 'native' : t.address,
        decimals: t.decimals,
        stable: t.stable,
      })),
      pricing: allPrices,
    },
  };
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

// --- Internal verification ---

interface X402Verification {
  valid: boolean;
  error?: string;
  usdValue?: number;
  tokenSymbol?: string;
  from?: string;
}

async function verifyX402Payment(
  txHash: string,
  requiredUsd: number,
): Promise<X402Verification> {
  try {
    // Fetch both transaction and receipt in parallel
    const [txRes, receiptRes] = await Promise.all([
      fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getTransactionByHash',
          params: [txHash],
        }),
      }),
      fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 2,
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        }),
      }),
    ]);

    const [txData, receiptData] = await Promise.all([txRes.json(), receiptRes.json()]);
    const tx = txData.result;
    const receipt = receiptData.result;

    if (!receipt || !tx) {
      return { valid: false, error: 'Transaction not found or still pending' };
    }

    if (receipt.status !== '0x1') {
      return { valid: false, error: 'Transaction failed on-chain' };
    }

    // --- Path A: Native ETH transfer ---
    const ethValue = BigInt(tx.value || '0x0');
    if (ethValue > 0n && tx.to?.toLowerCase() === WALLET_ADDRESS) {
      const ethPrice = await getTokenPriceUsd('ETH');
      if (!ethPrice) {
        return { valid: false, error: 'Unable to fetch ETH price from oracle' };
      }

      const usdValue = calculateUsdValue(ethValue, 18, ethPrice);
      if (usdValue < requiredUsd) {
        return { valid: false, error: `Insufficient amount: $${usdValue.toFixed(2)} < $${requiredUsd.toFixed(2)}` };
      }

      return {
        valid: true,
        usdValue,
        tokenSymbol: 'ETH',
        from: tx.from.toLowerCase(),
      };
    }

    // --- Path B: ERC-20 token transfer ---
    const transferLog = receipt.logs.find(
      (log: { address: string; topics: string[] }) =>
        SUPPORTED_ADDRESSES.has(log.address.toLowerCase()) &&
        log.topics[0] === TRANSFER_TOPIC,
    );

    if (!transferLog) {
      const tokenList = SUPPORTED_TOKENS.map((t) => t.symbol).join(', ');
      return { valid: false, error: `No supported token transfer found. Accepted: ${tokenList}` };
    }

    const tokenConfig = TOKEN_MAP.get(transferLog.address.toLowerCase());
    if (!tokenConfig) {
      return { valid: false, error: 'Token not recognized' };
    }

    const toAddress = '0x' + transferLog.topics[2].slice(26).toLowerCase();
    const fromAddress = '0x' + transferLog.topics[1].slice(26).toLowerCase();
    const rawAmount = BigInt(transferLog.data);

    if (toAddress !== WALLET_ADDRESS) {
      return { valid: false, error: 'Payment sent to wrong address' };
    }

    let usdValue: number;

    if (tokenConfig.stable) {
      // Stablecoins: 1 token unit = $1
      usdValue = tokenAmountToUnits(rawAmount, tokenConfig.decimals);
    } else {
      // Volatile tokens: fetch price from Chainlink
      const price = await getTokenPriceUsd(tokenConfig.symbol);
      if (!price) {
        return { valid: false, error: `Unable to fetch ${tokenConfig.symbol} price from oracle` };
      }
      usdValue = calculateUsdValue(rawAmount, tokenConfig.decimals, price);
    }

    if (usdValue < requiredUsd) {
      return { valid: false, error: `Insufficient amount: $${usdValue.toFixed(2)} < $${requiredUsd.toFixed(2)}` };
    }

    return {
      valid: true,
      usdValue,
      tokenSymbol: tokenConfig.symbol,
      from: fromAddress,
    };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err}` };
  }
}
