import { validateApiKey } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AuthContext } from '@/lib/adapters/payment/index';
import { getTemplatePrice, getAllPrices } from './pricing';

const BASE_RPC = 'https://mainnet.base.org';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
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
    };
  }

  // 2. Try x402 payment proof
  const paymentHeader = request.headers.get('x-payment') || request.headers.get('X-Payment');
  if (!paymentHeader) return null;

  // Parse x402 payment proof (tx hash on Base)
  let txHash: string;
  try {
    // x402 payment header can be a JSON object or a bare tx hash
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
  const requiredAmount = templateSlug ? await getTemplatePrice(templateSlug) : 3_000000n;

  // Try to claim this tx_hash atomically
  const { data: claimed, error: claimError } = await db
    .from('x402_payments')
    .insert({
      tx_hash: txHash,
      payer_wallet: 'pending', // updated after verification
      amount_usdc: 0,
      template_slug: templateSlug || 'unknown',
      chain: 'base',
    })
    .select('id')
    .single();

  if (claimError) {
    // UNIQUE violation = already claimed
    // Check if it's an unclaimed retry (contract_id is NULL)
    const { data: existing } = await db
      .from('x402_payments')
      .select('id, payer_wallet, contract_id')
      .eq('tx_hash', txHash)
      .single();

    if (existing?.contract_id) {
      // Already used for a contract — reject
      return null;
    }

    if (existing?.payer_wallet && existing.payer_wallet !== 'pending') {
      // Unclaimed retry — allow through with existing wallet
      return {
        type: 'x402',
        payerWallet: existing.payer_wallet,
        txHash,
      };
    }
    return null;
  }

  // 4. Verify on-chain
  const verification = await verifyX402Payment(txHash, requiredAmount);

  if (!verification.valid) {
    // Clean up failed claim
    await db.from('x402_payments').delete().eq('tx_hash', txHash);
    return null;
  }

  // 5. Update claim with real data
  await db
    .from('x402_payments')
    .update({
      payer_wallet: verification.from!,
      amount_usdc: Number(verification.amount!) / 1_000_000,
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
    pricing: Record<string, string>;
  };
}> {
  const price = templateSlug ? await getTemplatePrice(templateSlug) : undefined;
  const allPrices = await getAllPrices();

  return {
    error: 'payment_required',
    message: 'Payment required. Send USDC on Base to the recipient address, then retry with X-Payment header containing the tx hash.',
    x402: {
      version: '2',
      price: price ? price.toString() : undefined,
      currency: 'USDC',
      chain: 'base',
      recipient: process.env.NEXT_PUBLIC_WALLET_ADDRESS || '',
      description: templateSlug
        ? `Create Ricardian Contract (${templateSlug})`
        : 'Create Ricardian Contract',
      accepts: ['exact', 'overpay'],
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

// --- Internal: verify USDC transfer on Base ---

interface X402Verification {
  valid: boolean;
  error?: string;
  amount?: bigint;
  from?: string;
}

async function verifyX402Payment(
  txHash: string,
  requiredAmount: bigint,
): Promise<X402Verification> {
  try {
    const receiptRes = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });

    const receiptData = await receiptRes.json();
    const receipt = receiptData.result;

    if (!receipt) {
      return { valid: false, error: 'Transaction not found or still pending' };
    }

    if (receipt.status !== '0x1') {
      return { valid: false, error: 'Transaction failed on-chain' };
    }

    const transferLog = receipt.logs.find(
      (log: { address: string; topics: string[] }) =>
        log.address.toLowerCase() === USDC_CONTRACT.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC,
    );

    if (!transferLog) {
      return { valid: false, error: 'No USDC transfer found in transaction' };
    }

    const toAddress = '0x' + transferLog.topics[2].slice(26).toLowerCase();
    const fromAddress = '0x' + transferLog.topics[1].slice(26).toLowerCase();
    const amount = BigInt(transferLog.data);

    if (toAddress !== WALLET_ADDRESS) {
      return { valid: false, error: 'Payment sent to wrong address' };
    }

    if (amount < requiredAmount) {
      return { valid: false, error: `Insufficient amount` };
    }

    return { valid: true, amount, from: fromAddress };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err}` };
  }
}
