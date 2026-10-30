/**
 * The next status a contract may take after a signature, given who has signed.
 * Mirrors enforce_status_transition() in the database
 * (supabase/migrations/20260611160000_handshake_and_expiry_semantics.sql):
 *
 *   draft | handshake -> pending_signature        (any contract)
 *   draft | handshake -> active                   (one-sided contracts only)
 *   pending_signature -> active
 *
 * A two-sided contract therefore always steps through pending_signature, even
 * when every signature is already on file; the caller applies one step at a
 * time. Statuses that signing does not move (awaiting_principal_approval,
 * active, terminal ones) return unchanged.
 */
export function nextSigningStatus(status: string, oneSided: boolean, complete: boolean): string {
  if (status === 'draft' || status === 'handshake') {
    return oneSided && complete ? 'active' : 'pending_signature';
  }
  if (status === 'pending_signature' && complete) return 'active';
  return status;
}
