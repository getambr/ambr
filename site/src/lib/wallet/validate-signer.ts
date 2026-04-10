/**
 * Signer Validation
 *
 * Validates that a BrowserProvider can produce a usable signer with a valid
 * address before any signing operations are attempted. Catches wallet extension
 * bugs (e.g. SafePal returning undefined address) early, before signMessage().
 */

import type { BrowserProvider, JsonRpcSigner } from 'ethers';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function validateSigner(provider: BrowserProvider): Promise<JsonRpcSigner> {
  let signer: JsonRpcSigner;

  try {
    signer = await provider.getSigner();
  } catch {
    throw new Error('Could not obtain a signer from your wallet. Please unlock it and try again.');
  }

  let address: string;
  try {
    address = await signer.getAddress();
  } catch {
    throw new Error('Could not read your wallet address. Your wallet may not be fully compatible.');
  }

  if (!address || !ADDRESS_RE.test(address)) {
    throw new Error('Invalid wallet address returned. Please try a different wallet.');
  }

  return signer;
}
