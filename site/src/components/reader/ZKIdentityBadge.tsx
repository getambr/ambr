'use client';

import { ShieldCheck } from 'lucide-react';

interface ZKIdentityBadgeProps {
  provider?: string;
  compact?: boolean;
}

export default function ZKIdentityBadge({ provider = 'demos', compact }: ZKIdentityBadgeProps) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono text-amber-400">
        <img src="/demos-logo.svg" alt="" className="h-2.5 w-2.5 opacity-70" />
        ZK
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-mono text-amber-400">
      <img src="/demos-logo.svg" alt="Demos" className="h-3.5 w-3.5 opacity-80" />
      ZK Verified
      <span className="text-amber-600">({provider})</span>
    </span>
  );
}
