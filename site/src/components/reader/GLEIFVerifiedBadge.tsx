'use client';

import { ShieldCheck, ShieldAlert } from 'lucide-react';

interface GLEIFVerifiedBadgeProps {
  /** DACS VerifyResult decision: 'pass' | 'fail' | 'indeterminate' | 'error'. */
  decision: string;
  /** GLEIF legal name (shown on a pass). */
  legalName?: string | null;
  /** GLEIF registration status, e.g. ISSUED / LAPSED. */
  status?: string | null;
}

/**
 * DACS-2 Vet trust badge — surfaces a counterparty's GLEIF/LEI verification in the
 * reader. Fail-OPEN: renders nothing for indeterminate/error so an unwired or
 * testnet-grade verification never adds noise. Mirrors ZKIdentityBadge.
 */
export default function GLEIFVerifiedBadge({ decision, legalName, status }: GLEIFVerifiedBadgeProps) {
  if (decision === 'pass') {
    return (
      <span
        title={`Verified against GLEIF${status ? ` · status ${status}` : ''}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-mono text-emerald-400"
      >
        <ShieldCheck className="h-3.5 w-3.5 opacity-80" />
        <span>Verified vs GLEIF</span>
        {legalName ? <span className="text-emerald-600">— {legalName}</span> : null}
      </span>
    );
  }

  if (decision === 'fail') {
    return (
      <span
        title={status ? `GLEIF registration status: ${status}` : 'GLEIF check did not pass'}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-mono text-amber-400"
      >
        <ShieldAlert className="h-3.5 w-3.5 opacity-80" />
        <span>GLEIF: not verified</span>
        {status && status !== 'ISSUED' ? <span className="text-amber-600">({status})</span> : null}
      </span>
    );
  }

  // indeterminate / error — fail-open, render nothing.
  return null;
}
