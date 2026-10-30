'use client';

import { useState, useEffect } from 'react';

export interface AgentStats {
  total_contracts_served: number;
  active_contracts: number;
  skills_count: number;
}

export interface AgentData {
  name: string;
  description: string;
  url: string;
  version: string;
  skills: { id: string; name: string }[];
  securitySchemes: Record<string, { type: string }>;
  stats?: AgentStats;
}

/**
 * Fetches the live A2A Agent Card from /.well-known/agent.json once on mount.
 * Shared by HeroSection (proof strip) and AgentCardSection so both read the
 * same live stats. `loading` lets callers render a graceful placeholder
 * instead of a bare "--" before the fetch settles.
 */
export function useAgentCard() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/.well-known/agent.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setData(d as AgentData);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading, stats: data?.stats };
}
