/**
 * Verify token payment on Base L2 for API key tier activation.
 * Supports all tokens from the shared registry: USDC, USDbC, DAI, ETH, WETH, cbETH, cbBTC.
 */

import {
  SUPPORTED_TOKENS,
  SUPPORTED_ADDRESSES,
  TOKEN_MAP,
  tokenAmountToUnits,
} from '@/lib/x402/tokens';
import { getTokenPriceUsd, calculateUsdValue } from '@/lib/x402/oracle';

const BASE_RPC = 'https://mainnet.base.org';
const WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? '';

if (!WALLET_ADDRESS) {
  throw new Error('NEXT_PUBLIC_WALLET_ADDRESS environment variable is required');
}

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Tier pricing in USD
const TIER_AMOUNTS: Record<string, number> = {
  starter: 29,
  builder: 99,
  enterprise: 299,
};

interface PaymentVerification {
  valid: boolean;
  error?: string;
  amount?: string;
  from?: string;
  token?: string;
}

export async function verifyUSDCPayment(
  txHash: string,
  tier: string,
): Promise<PaymentVerification> {
  const requiredUsd = TIER_AMOUNTS[tier];
  if (!requiredUsd) {
    return { valid: false, error: `Unknown tier: ${tier}` };
  }

  // Fetch tx + receipt in parallel
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

  // --- Path A: Native ETH ---
  const ethValue = BigInt(tx.value || '0x0');
  if (ethValue > 0n && tx.to?.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
    const ethPrice = await getTokenPriceUsd('ETH');
    if (!ethPrice) {
      return { valid: false, error: 'Unable to fetch ETH price from oracle' };
    }

    const usdValue = calculateUsdValue(ethValue, 18, ethPrice);
    if (usdValue < requiredUsd) {
      return {
        valid: false,
        error: `Insufficient: $${usdValue.toFixed(2)} in ETH, required $${requiredUsd} for ${tier} tier`,
      };
    }

    return {
      valid: true,
      amount: usdValue.toFixed(2),
      from: tx.from.toLowerCase(),
      token: 'ETH',
    };
  }

  // --- Path B: ERC-20 transfer ---
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

  if (toAddress !== WALLET_ADDRESS.toLowerCase()) {
    return { valid: false, error: 'Payment sent to wrong address' };
  }

  let usdValue: number;

  if (tokenConfig.stable) {
    usdValue = tokenAmountToUnits(rawAmount, tokenConfig.decimals);
  } else {
    const price = await getTokenPriceUsd(tokenConfig.symbol);
    if (!price) {
      return { valid: false, error: `Unable to fetch ${tokenConfig.symbol} price from oracle` };
    }
    usdValue = calculateUsdValue(rawAmount, tokenConfig.decimals, price);
  }

  if (usdValue < requiredUsd) {
    return {
      valid: false,
      error: `Insufficient: $${usdValue.toFixed(2)} in ${tokenConfig.symbol}, required $${requiredUsd} for ${tier} tier`,
    };
  }

  return {
    valid: true,
    amount: usdValue.toFixed(2),
    from: fromAddress,
    token: tokenConfig.symbol,
  };
}
