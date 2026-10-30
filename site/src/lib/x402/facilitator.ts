import { HTTPFacilitatorClient, type FacilitatorClient } from '@x402/core/server';

/**
 * x402 v2 configuration, read from env on every call so a deployment can be
 * reconfigured without code changes and tests can flip NODE_ENV.
 *
 *   X402_NETWORK          CAIP-2 chain id. Default eip155:8453 (Base) in
 *                         production, eip155:84532 (Base Sepolia) elsewhere.
 *   X402_FACILITATOR_URL  Required in production. Outside production it
 *                         defaults to the public testnet facilitator.
 *   CDP_API_KEY_ID / CDP_API_KEY_SECRET
 *                         Required when the facilitator is Coinbase CDP.
 *   X402_ALLOW_TESTNET    Set to 1 to allow a non-Base-mainnet network in
 *                         production (staging deployments only).
 *   NEXT_PUBLIC_WALLET_ADDRESS
 *                         The recipient (payTo) address.
 */

export const TESTNET_FACILITATOR_URL = 'https://x402.org/facilitator';
export const CDP_FACILITATOR_HOST = 'api.cdp.coinbase.com';

export type X402Network = `${string}:${string}`;

export type X402Config =
  | {
      ok: true;
      network: X402Network;
      /** Short label stored in x402_payments.chain */
      chain: string;
      facilitatorUrl: string;
      payTo: string;
    }
  | { ok: false; reason: string };

const CHAIN_LABELS: Record<string, string> = {
  'eip155:8453': 'base',
  'eip155:84532': 'base-sepolia',
};

export function resolveX402Config(): X402Config {
  const production = process.env.NODE_ENV === 'production';

  const network = (process.env.X402_NETWORK?.trim() ||
    (production ? 'eip155:8453' : 'eip155:84532')) as string;
  if (!/^eip155:\d+$/.test(network)) {
    return { ok: false, reason: 'X402_NETWORK must be a CAIP-2 EVM id such as eip155:8453' };
  }
  // A stray testnet value in a production deploy would sell contracts for
  // worthless test USDC. Refuse unless explicitly allowed.
  if (production && network !== 'eip155:8453' && process.env.X402_ALLOW_TESTNET !== '1') {
    return { ok: false, reason: 'testnet_in_production' };
  }

  const payTo = (process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
    return { ok: false, reason: 'No valid recipient address configured' };
  }

  const configuredUrl = process.env.X402_FACILITATOR_URL?.trim();
  if (!configuredUrl && production) {
    return { ok: false, reason: 'X402_FACILITATOR_URL is required in production' };
  }
  const facilitatorUrl = (configuredUrl || TESTNET_FACILITATOR_URL).replace(/\/+$/, '');

  let facilitatorHost: string;
  try {
    facilitatorHost = new URL(facilitatorUrl).host;
  } catch {
    return { ok: false, reason: 'X402_FACILITATOR_URL is not a valid URL' };
  }

  if (facilitatorHost === CDP_FACILITATOR_HOST) {
    if (!process.env.CDP_API_KEY_ID?.trim() || !process.env.CDP_API_KEY_SECRET?.trim()) {
      return { ok: false, reason: 'CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for the CDP facilitator' };
    }
  }

  return {
    ok: true,
    network: network as X402Network,
    chain: CHAIN_LABELS[network] ?? network,
    facilitatorUrl,
    payTo,
  };
}

/**
 * Build the facilitator client. The CDP facilitator signs every request with a
 * short-lived JWT made from the CDP API key (`@coinbase/x402` does the JWT);
 * any other facilitator is called without credentials.
 */
export async function createFacilitatorClient(
  cfg: Extract<X402Config, { ok: true }>,
  opts: { timeoutMs?: number } = {},
): Promise<FacilitatorClient> {
  // timeoutMs bounds every facilitator HTTP attempt (default 90 s in the
  // client); the health check passes its own budget so a lost race does not
  // leave a request and its retries running after the response went out.
  if (new URL(cfg.facilitatorUrl).host === CDP_FACILITATOR_HOST) {
    const { createCdpAuthHeaders } = await import('@coinbase/x402');
    return new HTTPFacilitatorClient({
      url: cfg.facilitatorUrl,
      timeoutMs: opts.timeoutMs,
      createAuthHeaders: createCdpAuthHeaders(
        process.env.CDP_API_KEY_ID,
        process.env.CDP_API_KEY_SECRET,
      ),
    });
  }
  return new HTTPFacilitatorClient({ url: cfg.facilitatorUrl, timeoutMs: opts.timeoutMs });
}
