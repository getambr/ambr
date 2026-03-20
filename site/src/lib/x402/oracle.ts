/**
 * Chainlink price oracle for volatile token payments on Base L2.
 * Reads latestRoundData() from Chainlink Aggregator V3 proxies.
 *
 * All Chainlink USD feeds return price with 8 decimals.
 * e.g., ETH at $3,450.12 → 345012000000 (3450.12 * 10^8)
 */

import { PRICE_FEEDS, TOKEN_FEED_MAP } from './tokens';

const BASE_RPC = 'https://mainnet.base.org';

// Chainlink AggregatorV3Interface: latestRoundData() selector
// Returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c';

const CHAINLINK_DECIMALS = 8;

// Cache prices for 60 seconds to avoid hammering RPC
const priceCache = new Map<string, { price: number; ts: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Get the current USD price of a token via Chainlink.
 * Returns price as a number (e.g., 3450.12 for ETH).
 * Returns null if the feed is unavailable or stale.
 */
export async function getTokenPriceUsd(tokenSymbol: string): Promise<number | null> {
  const feedKey = TOKEN_FEED_MAP[tokenSymbol];
  if (!feedKey) return null;

  const feedAddress = PRICE_FEEDS[feedKey];
  if (!feedAddress) return null;

  // Check cache
  const cached = priceCache.get(feedKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const res = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          { to: feedAddress, data: LATEST_ROUND_DATA_SELECTOR },
          'latest',
        ],
      }),
    });

    const data = await res.json();
    const result = data.result as string;

    if (!result || result === '0x') return null;

    // Decode: skip roundId (32 bytes), read answer (next 32 bytes)
    // result is 0x + 5 * 64 hex chars (5 uint256 slots)
    const answerHex = '0x' + result.slice(66, 130); // bytes 32-64
    const answer = BigInt(answerHex);

    // Chainlink can return negative for some feeds (shouldn't for USD pairs)
    if (answer <= 0n) return null;

    const price = Number(answer) / 10 ** CHAINLINK_DECIMALS;

    // Sanity check: ETH should be >$100, BTC should be >$1000
    if (feedKey === 'ETH/USD' && price < 100) return null;
    if (feedKey === 'BTC/USD' && price < 1000) return null;

    // Check freshness: updatedAt is at offset 3 (bytes 96-128)
    const updatedAtHex = '0x' + result.slice(194, 258);
    const updatedAt = Number(BigInt(updatedAtHex)) * 1000; // seconds → ms
    const staleThreshold = 3600_000; // 1 hour
    if (Date.now() - updatedAt > staleThreshold) {
      // Feed is stale — don't trust it
      return null;
    }

    priceCache.set(feedKey, { price, ts: Date.now() });
    return price;
  } catch {
    return null;
  }
}

/**
 * Given a token amount and its USD price, calculate the USD value.
 */
export function calculateUsdValue(
  amount: bigint,
  decimals: number,
  priceUsd: number,
): number {
  const units = Number(amount) / 10 ** decimals;
  return units * priceUsd;
}
