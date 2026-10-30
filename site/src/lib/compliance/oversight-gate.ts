import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * The EU AI Act Article 14 oversight gate, in one place.
 *
 * Why this module exists: the gate must apply on every door that creates a
 * contract. Implemented inline in the REST create route alone, it would be missing
 * from the MCP `ambr_create_contract` tool, which is also what the A2A surface
 * routes to. A human clicking through the dashboard would get the oversight halt
 * and an autonomous agent creating the same mandate over A2A would get a plain draft.
 *
 * That is backwards. A person at a dashboard is already the human in the loop;
 * an agent acting alone is the case Article 14 exists for. The gate belongs where
 * it is most needed, not only where it is least.
 *
 * Both doors call `resolveOversight`. Do not inline this logic again: two
 * copies diverge.
 */

export interface OversightInput {
  /** A threshold this contract DECLARES, governing work done under it. */
  declaredThresholdUsd?: number | null;
  /** SHA-256 of the parent contract, when this one is created under a mandate. */
  parentContractHash?: string | null;
  /** The new contract's parameters — the transaction value is read from these. */
  parameters?: Record<string, unknown> | null;
}

export interface OversightDecision {
  /** Written to contracts.oversight_threshold_usd and into machine_readable. */
  oversightThresholdUsd: number | null;
  /** True when the parent's threshold governs and this contract exceeds it. */
  requiresPrincipalApproval: boolean;
  /** The threshold that actually gated this contract, when one did. */
  governingThresholdUsd: number | null;
  /** The transaction value compared against the threshold. */
  transactionValueUsd: number;
}

/**
 * The value a contract represents, for threshold comparison. Mirrors the order
 * the REST route has always used; kept as one list so the two callers cannot
 * disagree about which parameter counts.
 */
export function transactionValueOf(parameters: Record<string, unknown> | null | undefined): number {
  const p = parameters ?? {};
  return Number(p.value_usd ?? p.spending_limit_per_tx ?? p.amount ?? 0);
}

export async function resolveOversight(input: OversightInput): Promise<OversightDecision> {
  // A contract may declare the threshold that governs its children. A parent's
  // threshold still decides whether THIS contract needs approval; the declared
  // value is what this contract passes down.
  let oversightThresholdUsd: number | null = input.declaredThresholdUsd ?? null;
  let requiresPrincipalApproval = false;
  let governingThresholdUsd: number | null = null;

  const transactionValueUsd = transactionValueOf(input.parameters);

  if (input.parentContractHash) {
    const db = getSupabaseAdmin();
    const { data: parentContract } = await db
      .from('contracts')
      .select('machine_readable, oversight_threshold_usd, status')
      .eq('sha256_hash', input.parentContractHash)
      .eq('status', 'active')
      .single();

    if (parentContract) {
      // A parent carries its threshold in the column, or inside the hashed
      // document when it declared one at creation.
      const threshold =
        parentContract.oversight_threshold_usd ??
        (parentContract.machine_readable as Record<string, unknown> | null)?.oversight_threshold_usd;

      if (threshold != null) {
        governingThresholdUsd = Number(threshold);
        // Record what gated this contract when it does not declare its own, so
        // the row shows the number the decision was made against.
        oversightThresholdUsd = oversightThresholdUsd ?? governingThresholdUsd;

        if (transactionValueUsd > governingThresholdUsd) {
          requiresPrincipalApproval = true;
        }
      }
    }
  }

  return {
    oversightThresholdUsd,
    requiresPrincipalApproval,
    governingThresholdUsd,
    transactionValueUsd,
  };
}

/**
 * The threshold belongs inside the hashed document, not only in a database
 * column: the machine-readable half is what the SHA-256 commits to, so a limit
 * that lives only in a table is not part of the agreement a counterparty can
 * verify. Call this BEFORE hashing.
 */
export function applyThresholdToDocument(
  machineReadable: Record<string, unknown>,
  oversightThresholdUsd: number | null,
): void {
  if (oversightThresholdUsd != null) {
    machineReadable.oversight_threshold_usd = oversightThresholdUsd;
  }
}
