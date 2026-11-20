/**
 * Whether signing with a ZK identity (Demos) is offered to users. Off unless
 * NEXT_PUBLIC_ZK_IDENTITY_ENABLED is exactly "true": there is no way to
 * register an identity on Demos yet, so a contract that requires one cannot
 * be signed. The sign route fails closed whatever this says.
 */
export function isZKIdentityEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ZK_IDENTITY_ENABLED === 'true';
}

export const ZK_IDENTITY_COMING_SOON_NOTICE =
  'Signing with a verified identity is coming soon. This agreement cannot be signed until it is available.';

export const ZK_IDENTITY_UNAVAILABLE_ERROR = {
  error: 'zk_identity_unavailable',
  message: 'Signing with a verified identity is not available yet',
} as const;

export type ZKSigningGate = 'not_required' | 'verify' | 'coming_soon';

/** What the reader shows for a contract, given whether it requires a ZK identity. */
export function zkSigningGate(requireZkIdentity: boolean | undefined, enabled: boolean): ZKSigningGate {
  if (!requireZkIdentity) return 'not_required';
  return enabled ? 'verify' : 'coming_soon';
}
