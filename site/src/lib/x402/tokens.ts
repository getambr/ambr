/**
 * Supported tokens for x402 payments on Base L2.
 *
 * To add a new token: append to SUPPORTED_TOKENS (and PRICE_FEEDS if volatile).
 * The verification logic matches Transfer logs or native ETH value automatically.
 */

export interface TokenConfig {
  symbol: string;
  address: string; // checksummed — stored lowercase for matching
  decimals: number;
  name: string;
  stable: boolean; // true = 1:1 USD, no oracle needed
  native?: boolean; // true = ETH (verified via tx.value, not Transfer log)
}

export const SUPPORTED_TOKENS: TokenConfig[] = [
  // --- Stablecoins (no oracle) ---
  {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    name: 'USD Coin',
    stable: true,
  },
  {
    symbol: 'USDbC',
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    decimals: 6,
    name: 'Bridged USD Coin',
    stable: true,
  },
  {
    symbol: 'DAI',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    name: 'Dai Stablecoin',
    stable: true,
  },
  // --- Volatile (Chainlink oracle) ---
  {
    symbol: 'ETH',
    address: '0x0000000000000000000000000000000000000000', // placeholder — native
    decimals: 18,
    name: 'Ether',
    stable: false,
    native: true,
  },
  {
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
    name: 'Wrapped Ether',
    stable: false,
  },
  {
    symbol: 'cbETH',
    address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0Dec22',
    decimals: 18,
    name: 'Coinbase Wrapped Staked ETH',
    stable: false,
  },
  {
    symbol: 'cbBTC',
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    decimals: 8,
    name: 'Coinbase Wrapped BTC',
    stable: false,
  },
];

/** Chainlink price feed proxy addresses on Base mainnet (8 decimal output) */
export const PRICE_FEEDS: Record<string, string> = {
  'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
  'BTC/USD': '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F',
};

/** Map token symbol → which Chainlink feed to use */
export const TOKEN_FEED_MAP: Record<string, string> = {
  ETH: 'ETH/USD',
  WETH: 'ETH/USD',
  cbETH: 'ETH/USD', // close enough — cbETH trades ~1:1 with ETH
  cbBTC: 'BTC/USD',
};

/** Lowercase address → token config for O(1) lookup */
export const TOKEN_MAP = new Map<string, TokenConfig>(
  SUPPORTED_TOKENS.filter((t) => !t.native).map((t) => [t.address.toLowerCase(), t]),
);

/** All supported ERC-20 token addresses (lowercase) for log matching */
export const SUPPORTED_ADDRESSES = new Set(
  SUPPORTED_TOKENS.filter((t) => !t.native).map((t) => t.address.toLowerCase()),
);

/**
 * Convert a raw token amount to a USD number given the token's decimals.
 * For stablecoins: direct conversion (1 token = $1).
 * For volatile: caller must multiply by price separately.
 */
export function tokenAmountToUnits(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

/**
 * Convert a USDC-6-decimal price to the equivalent raw amount for a given token decimals.
 * Prices are stored in USDC 6-decimal format (e.g., 3_000000n = $3.00).
 */
export function priceToTokenAmount(priceUsdc6: bigint, decimals: number): bigint {
  if (decimals === 6) return priceUsdc6;
  if (decimals > 6) {
    return priceUsdc6 * (10n ** BigInt(decimals - 6));
  }
  return priceUsdc6 / (10n ** BigInt(6 - decimals));
}
