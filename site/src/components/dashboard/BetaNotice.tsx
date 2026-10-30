'use client';

/**
 * Dashboard-wide beta notice.
 *
 * Honest, plain-English strip shown to every signed-in dashboard user (not
 * gated to ADMIN_EMAILS). Tells testers we're moving fast and gives them a
 * direct line for bug reports. Dismissible per-browser via localStorage.
 *
 * Bump DISMISS_KEY's version suffix (v1 → v2) when we want previously
 * dismissed users to re-see the notice (e.g. after a major release or
 * breaking-change window).
 */

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

const DISMISS_KEY = 'ambr_beta_notice_dismissed_v1';

export default function BetaNotice() {
  // null during first render (SSR + hydration) so we don't flash the notice
  // for users who've already dismissed it. Resolves to true|false on mount.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed !== false) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber/25 bg-amber/[0.06] px-4 py-2.5">
      <div className="flex items-center gap-2 text-xs text-text-primary min-w-0">
        <AlertCircle className="w-3.5 h-3.5 text-amber shrink-0" />
        <span className="truncate sm:whitespace-normal">
          Active development — expect rough edges. Report issues to{' '}
          <a
            href="mailto:support@ambr.run"
            className="text-amber underline-offset-2 hover:underline"
          >
            support@ambr.run
          </a>
          .
        </span>
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            // localStorage unavailable — still hide for this session
          }
          setDismissed(true);
        }}
        className="text-text-secondary hover:text-text-primary shrink-0"
        aria-label="Dismiss beta notice"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
