/**
 * Verify USDC payment on Base L2 via public RPC.
 * No API key needed — uses the free Base mainnet RPC.
 */

const BASE_RPC = 'https://mainnet.base.org';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? '';

if (!WALLET_ADDRESS) {
  throw new Error('NEXT_PUBLIC_WALLET_ADDRESS environment variable is required');
}

// USDC Transfer event topic: Transfer(address,address,uint256)
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Tier pricing in USDC (6 decimals)
const TIER_AMOUNTS: Record<string, bigint> = {
  starter: 29_000000n, // $29
  builder: 99_000000n, // $99
  enterprise: 299_000000n, // $299
};

interface PaymentVerification {
  valid: boolean;
  error?: string;
  amount?: string;
  from?: string;
}

export async function verifyUSDCPayment(
  txHash: string,
  tier: string,
): Promise<PaymentVerification> {
  const requiredAmount = TIER_AMOUNTS[tier];
  if (!requiredAmount) {
    return { valid: false, error: `Unknown tier: ${tier}` };
  }

  // Fetch transaction receipt
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

  // Check tx succeeded
  if (receipt.status !== '0x1') {
    return { valid: false, error: 'Transaction failed on-chain' };
  }

  // Find the USDC Transfer log
  const transferLog = receipt.logs.find(
    (log: { address: string; topics: string[] }) =>
      log.address.toLowerCase() === USDC_CONTRACT.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC,
  );

  if (!transferLog) {
    return { valid: false, error: 'No USDC transfer found in transaction' };
  }

  // Decode Transfer event: topics[1] = from, topics[2] = to, data = amount
  const toAddress =
    '0x' + transferLog.topics[2].slice(26).toLowerCase();
  const fromAddress =
    '0x' + transferLog.topics[1].slice(26).toLowerCase();
  const amount = BigInt(transferLog.data);

  // Verify recipient matches our wallet
  if (toAddress !== WALLET_ADDRESS.toLowerCase()) {
    return {
      valid: false,
      error: 'Payment sent to wrong address',
    };
  }

  // Verify amount meets tier minimum
  if (amount < requiredAmount) {
    const received = Number(amount) / 1_000_000;
    const required = Number(requiredAmount) / 1_000_000;
    return {
      valid: false,
      error: `Insufficient amount: received $${received}, required $${required} for ${tier} tier`,
    };
  }

  return {
    valid: true,
    amount: (Number(amount) / 1_000_000).toFixed(2),
    from: fromAddress,
  };
}
