/**
 * Ambr Legibility Principle — canonical copy.
 *
 * Single source of truth for the governance framing that rides on every
 * discovery surface: /.well-known/agent.json extensions, public/llms.txt,
 * /spec/ricardian-v1, and the MCP tool descriptions. Edit here, not in
 * any of the consumers.
 */

export const GOVERNANCE_NAMESPACE = 'io.ambr.governance';

export const RICARDIAN_URN = 'urn:ambr:ricardian-v1';

export const LEGIBILITY_PRINCIPLE = {
  title: 'Legibility by construction',
  summary:
    'Every action facilitated by Ambr produces a dual-format Ricardian Contract — the same agreement expressed as human-readable legal prose and machine-parsable JSON, bound by SHA-256. Legible actions can be audited, defended, and amended. Agents grounded in dual-format contracts stay defensible as governance standards harden — for their principals, their counterparties, and the platforms that host them. Ambr provides that grounding so agents you deploy today are still defensible tomorrow.',
  basisFor: [
    'audit-trail',
    'bilateral-amendment',
    'delegation-authority',
    'dispute-resolution',
  ],
} as const;

/** One-clause version appended to skill / tool descriptions. Short enough to ride per-tool. */
export const LEGIBILITY_CLAUSE =
  "Output is dual-format by construction and replayable to the original SHA-256 hash — the basis of Ambr's legibility guarantee.";
