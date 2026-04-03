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
        <ShieldCheck className="h-3 w-3" />
        ZK
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-mono text-amber-400">
      <ShieldCheck className="h-3.5 w-3.5" />
      ZK Verified
      <span className="text-amber-600">({provider})</span>
    </span>
  );
}
