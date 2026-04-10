import { ethers } from 'ethers';

/**
 * Base L2 RPC configuration with fallback providers.
 * If the primary RPC (Base public) is down, falls back to alternatives.
 */
const BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base.drpc.org',
];

/**
 * Get a working JsonRpcProvider for Base L2, trying each RPC in order.
 * Adds a 30s timeout per provider to prevent Vercel serverless hangs.
 */
export async function getBaseProvider(): Promise<ethers.JsonRpcProvider> {
  for (const rpc of BASE_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, undefined, {
        staticNetwork: ethers.Network.from(8453),
      });
      // Quick health check — getBlockNumber is cheap
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`RPC timeout: ${rpc}`)), 10_000),
        ),
      ]);
      return provider;
    } catch {
      console.warn(`Base RPC ${rpc} unavailable, trying next...`);
    }
  }
  throw new Error('All Base L2 RPC endpoints unavailable');
}

/**
 * Retry a function with exponential backoff. Base 1s, max 3 attempts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(`${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
