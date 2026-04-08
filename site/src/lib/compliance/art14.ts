/**
 * EU AI Act Article 14 — Human oversight enforcement for contract amendments.
 *
 * Article 14 requires that high-risk AI systems be subject to effective human
 * oversight, meaning a natural person (the principal) must be able to decide
 * not to use or override the output of the AI system. For Ambr this means:
 * when an AI agent acting on behalf of a principal tries to approve a contract
 * amendment whose financial impact exceeds the contract's
 * `oversight_threshold_usd`, the approval MUST be escalated to the human
 * principal regardless of whether the agent's `delegation_scope` would
 * otherwise permit it.
 *
 * This helper computes the spending delta between the original contract's
 * machine-readable parameters and the proposed amendment's parameters. If the
 * delta (or the new absolute value, whichever is larger) exceeds the
 * threshold, we flag it as requiring human escalation.
 *
 * Reference:
 *   - EU AI Act Article 14 (human oversight): https://artificialintelligenceact.eu/article/14/
 *   - Ambr enforcement point: amendments approve route
 */

/**
 * Fields in machine_readable that represent monetary values. Checked in
 * order; the LARGEST absolute value wins. This is intentionally conservative
 * — if any monetary field in the amendment exceeds the threshold, the whole
 * proposal is gated behind human principal approval.
 */
const MONETARY_FIELDS = [
  'spending_limit_per_tx',
  'spending_limit_monthly',
  'budget_usd',
  'total_price',
  'monthly_fee',
  'shared_budget_monthly',
  'per_agent_tx_limit',
  'escalation_threshold',
  'monthly_cap_usd',
  'price_per_call',
] as const;

function extractMaxMonetaryValue(params: Record<string, unknown> | null | undefined): number {
  if (!params || typeof params !== 'object') return 0;
  let max = 0;
  for (const field of MONETARY_FIELDS) {
    const raw = (params as Record<string, unknown>)[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      if (Math.abs(raw) > max) max = Math.abs(raw);
    } else if (typeof raw === 'string') {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed) && Math.abs(parsed) > max) max = Math.abs(parsed);
    }
  }
  return max;
}

/**
 * Compute the spending delta between original and proposed contract parameters.
 * Returns the larger of: (a) the absolute delta between original and proposed
 * max monetary values, or (b) the proposed max monetary value itself.
 *
 * Rationale: a proposal that ADDS a new $100k spending authority where none
 * existed before (delta = $100k, proposed = $100k) should be treated the same
 * as a proposal that DOUBLES an existing $50k to $100k (delta = $50k,
 * proposed = $100k). Both represent a $100k exposure that the human principal
 * should review.
 */
export function computeSpendingChange(
  originalParams: Record<string, unknown> | null | undefined,
  proposedParams: Record<string, unknown> | null | undefined,
): number {
  const originalMax = extractMaxMonetaryValue(originalParams);
  const proposedMax = extractMaxMonetaryValue(proposedParams);
  const delta = Math.abs(proposedMax - originalMax);
  return Math.max(delta, proposedMax);
}

/**
 * Returns true if the amendment requires human principal approval under
 * EU AI Act Article 14 — i.e., the computed spending change exceeds the
 * contract's oversight_threshold_usd.
 *
 * If threshold is null, no gating is enforced (backward compat with older
 * contracts that predate the oversight_threshold_usd column).
 */
export function requiresHumanEscalation(
  originalParams: Record<string, unknown> | null | undefined,
  proposedParams: Record<string, unknown> | null | undefined,
  oversightThresholdUsd: number | null,
): { required: boolean; spendingChange: number; threshold: number | null } {
  const spendingChange = computeSpendingChange(originalParams, proposedParams);
  if (oversightThresholdUsd === null || oversightThresholdUsd === undefined) {
    return { required: false, spendingChange, threshold: null };
  }
  return {
    required: spendingChange > oversightThresholdUsd,
    spendingChange,
    threshold: oversightThresholdUsd,
  };
}
