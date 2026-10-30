/**
 * Jurisdiction-aware cooling-off period lookup for A1 (consumer service
 * purchase) contracts.
 *
 * Background: The A1 template previously hardcoded a 14-day cooling-off
 * default, which is correct ONLY for EU/UK consumers. US, Singapore, and
 * many other jurisdictions have no general consumer cooling-off regime;
 * forcing 14 days onto an A1 contract governed by US law misrepresents
 * the legal landscape. China has a 7-day regime for cross-border e-commerce.
 *
 * This module owns the mapping. Used by:
 *  - src/lib/llm/prompts.ts (informs the A1 system prompt)
 *  - src/app/api/v1/chat/route.ts (server-side normalization + warning)
 *
 * To extend: add a row to JURISDICTION_DAYS keyed by lowercased exact match
 * OR lowercased contains-match (matched in that priority order in
 * deriveCoolingOffDays). Country codes (e.g. "de", "fr") and full names
 * ("Germany", "France") both work — store lowercase.
 *
 * Caveats explicitly tracked:
 *  - EU mandatory: covers the 14-day Directive 2011/83/EU (Art. 9-16)
 *  - UK 14 days: Consumer Contracts (Information, Cancellation and
 *    Additional Charges) Regulations 2013, reg. 29 — survived Brexit
 *  - China 7 days: e-commerce law for cross-border B2C (some categories
 *    exempt — server emits a warning so the user reviews case-by-case)
 *  - US: no FEDERAL regime; FTC cooling-off rule only covers door-to-door
 *    sales. Some states (CA, NY) have specialized regimes (timeshare,
 *    dating services, etc.) we don't enumerate — defaults to "0 days with
 *    warning" so the contract doesn't claim a protection that doesn't apply
 *  - Singapore: Lemon Law covers defects, NOT general cooling-off
 *  - Cuba: civil-law system, no specific consumer cooling-off statute
 *    we're aware of — defaults to "0 days with warning"
 */

interface JurisdictionRule {
  /** Days the consumer has to withdraw without penalty. 0 = no general regime. */
  days: number;
  /** Short rationale shown to the user in validation_warnings. */
  rationale: string;
}

/**
 * Exact-match table. Keys are lowercased. Order doesn't matter — we look up
 * first by exact key, then fall back to contains-match via SUBSTRING_RULES.
 */
const JURISDICTION_DAYS: Record<string, JurisdictionRule> = {
  // ───────── EU member states + EU-wide ─────────
  'eu': { days: 14, rationale: 'EU Consumer Rights Directive 2011/83/EU Art. 9 — 14-day mandatory' },
  'european union': { days: 14, rationale: 'EU Consumer Rights Directive 2011/83/EU Art. 9 — 14-day mandatory' },
  'austria':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (KSchG)' },
  'belgium':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (CDE Art. VI.47)' },
  'bulgaria':    { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'croatia':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'cyprus':      { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'czech republic': { days: 14, rationale: 'EU Directive 2011/83/EU implemented (Civil Code §1820)' },
  'czechia':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (Civil Code §1820)' },
  'denmark':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (Forbrugeraftaleloven)' },
  'estonia':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'finland':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (KSL Ch. 6)' },
  'france':      { days: 14, rationale: 'EU Directive 2011/83/EU implemented (Code de la consommation L221-18)' },
  'germany':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (BGB §355, §312g)' },
  'greece':      { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'hungary':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'ireland':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented (CPA 2007)' },
  'italy':       { days: 14, rationale: 'EU Directive 2011/83/EU implemented (Codice del Consumo Art. 52)' },
  'latvia':      { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'lithuania':   { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'luxembourg':  { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'malta':       { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'netherlands': { days: 14, rationale: 'EU Directive 2011/83/EU implemented (BW Art. 6:230o)' },
  'poland':      { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'portugal':    { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'romania':     { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'slovakia':    { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'slovenia':    { days: 14, rationale: 'EU Directive 2011/83/EU implemented' },
  'spain':       { days: 14, rationale: 'EU Directive 2011/83/EU implemented (Ley General Defensa Consumidores Art. 102)' },
  'sweden':      { days: 14, rationale: 'EU Directive 2011/83/EU implemented (DAL §10)' },

  // ───────── UK (post-Brexit, kept the regime) ─────────
  'united kingdom': { days: 14, rationale: 'UK Consumer Contracts Regulations 2013, reg. 29 — 14 days' },
  'uk':             { days: 14, rationale: 'UK Consumer Contracts Regulations 2013, reg. 29 — 14 days' },
  'england':        { days: 14, rationale: 'UK Consumer Contracts Regulations 2013, reg. 29 — 14 days' },
  'scotland':       { days: 14, rationale: 'UK Consumer Contracts Regulations 2013, reg. 29 — 14 days' },
  'wales':          { days: 14, rationale: 'UK Consumer Contracts Regulations 2013, reg. 29 — 14 days' },
  'northern ireland': { days: 14, rationale: 'UK Consumer Contracts Regulations 2013, reg. 29 — 14 days' },

  // ───────── China — 7-day for cross-border e-commerce ─────────
  'china':                     { days: 7, rationale: 'PRC Consumer Rights Protection Law Art. 25 — 7 days (some categories exempt; review case-by-case)' },
  "people's republic of china": { days: 7, rationale: 'PRC Consumer Rights Protection Law Art. 25 — 7 days' },
  'prc':                       { days: 7, rationale: 'PRC Consumer Rights Protection Law Art. 25 — 7 days' },
  'cn':                        { days: 7, rationale: 'PRC Consumer Rights Protection Law Art. 25 — 7 days' },

  // ───────── No general cooling-off regime ─────────
  'singapore': { days: 0, rationale: 'Singapore has no general consumer cooling-off regime; Lemon Law (CPFTA Part III) covers defects only — consider stating a contractual cancellation period instead' },
  'sg':        { days: 0, rationale: 'Singapore has no general consumer cooling-off regime; consider stating a contractual cancellation period' },
  'united states':   { days: 0, rationale: 'US has no federal cooling-off rule for online services (FTC rule covers door-to-door only); some state laws may apply (CA timeshare, NY dating services). Consider stating a contractual cancellation period.' },
  'usa':             { days: 0, rationale: 'US has no federal cooling-off rule for online services; consider stating a contractual cancellation period' },
  'us':              { days: 0, rationale: 'US has no federal cooling-off rule for online services; consider stating a contractual cancellation period' },
  'united states of america': { days: 0, rationale: 'US has no federal cooling-off rule for online services; consider stating a contractual cancellation period' },
  'cuba':            { days: 0, rationale: "Cuba's civil-law system has no specific consumer cooling-off statute we're aware of — review with local counsel" },
  'australia':       { days: 0, rationale: 'Australia has no general cooling-off rule (some state regimes for door-to-door); ACL covers defects, not general cancellation' },
};

/**
 * Substring rules — applied after exact-match fails. Handle "Germany (EU)",
 * "California, US", etc. Order matters: more-specific matches first.
 */
const SUBSTRING_RULES: Array<{ match: string; rule: JurisdictionRule }> = [
  { match: 'european union', rule: JURISDICTION_DAYS['european union'] },
  { match: 'united kingdom', rule: JURISDICTION_DAYS['united kingdom'] },
  { match: 'united states', rule: JURISDICTION_DAYS['united states'] },
  { match: 'singapore', rule: JURISDICTION_DAYS['singapore'] },
];

/**
 * Map a free-text governing-law value to the right cooling-off period.
 * Returns the days count + a rationale string the server should include
 * in validation_warnings so the user understands WHY.
 *
 * Behaviour:
 *  - null/empty governing_law → returns days=14 (EU-biased default — most
 *    permissive for consumer, safe fallback). Caller should ideally have
 *    governing_law set before calling this; this fallback is for
 *    completeness so the function never returns undefined.
 *  - Exact match (lowercased) → that jurisdiction's rule
 *  - Substring match → matching jurisdiction (e.g. "Berlin, Germany" → DE rule)
 *  - No match → defaults to 14 with a "unfamiliar jurisdiction" warning so
 *    the user knows to verify
 */
export function deriveCoolingOffDays(
  governingLaw: string | null | undefined,
): { days: number; rationale: string; matched: boolean } {
  if (!governingLaw || typeof governingLaw !== 'string' || !governingLaw.trim()) {
    return {
      days: 14,
      rationale: 'No governing law specified — defaulting to EU 14-day standard (set governing_law to get jurisdiction-specific value)',
      matched: false,
    };
  }
  const k = governingLaw.toLowerCase().trim();

  const exact = JURISDICTION_DAYS[k];
  if (exact) return { ...exact, matched: true };

  for (const sub of SUBSTRING_RULES) {
    if (k.includes(sub.match)) return { ...sub.rule, matched: true };
  }

  return {
    days: 14,
    rationale: `Unfamiliar jurisdiction "${governingLaw}" — defaulting to EU 14-day standard. Review with local counsel.`,
    matched: false,
  };
}

/**
 * Apply the matrix to an extracted-params bag for the A1 template. Mutates a
 * copy (doesn't touch the input) so the chat route can re-use the result.
 * Returns the new params + any warnings to append to validation_warnings.
 *
 * Behaviour:
 *  - If cooling_off_days is already set and non-empty, returns the params
 *    unchanged (user/LLM intent wins).
 *  - If cooling_off_days is missing/null/empty, derives from governing_law
 *    and sets it. Adds the rationale to warnings so the user understands.
 *  - If derived days === 0 (no general regime), still sets the field to 0
 *    so downstream renders "0 days (no general regime)" rather than leaving
 *    the prompt's default 14 in place.
 */
export function normalizeCoolingOff(
  params: Record<string, unknown>,
): { params: Record<string, unknown>; warnings: string[] } {
  const existing = params.cooling_off_days;
  const hasValue =
    existing !== null &&
    existing !== undefined &&
    existing !== '' &&
    !(typeof existing === 'number' && Number.isNaN(existing));
  if (hasValue) {
    return { params, warnings: [] };
  }

  const governingLaw = typeof params.governing_law === 'string' ? params.governing_law : null;
  const derived = deriveCoolingOffDays(governingLaw);

  return {
    params: { ...params, cooling_off_days: derived.days },
    warnings: [
      `cooling_off_days defaulted to ${derived.days} day${derived.days === 1 ? '' : 's'} based on governing law (${governingLaw ?? 'unspecified'}): ${derived.rationale}`,
    ],
  };
}
