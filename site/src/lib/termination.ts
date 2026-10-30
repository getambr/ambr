import { verifyMessage } from 'ethers';

/**
 * Authorization and rules for bilateral termination of commerce/consumer contracts.
 *
 * Lives in lib/ for the same reason as approval-auth.ts: the repo has no API-route
 * test harness, so anything that decides who may end a contract has to be pure and
 * testable here, not buried in a route.
 *
 * Why this exists: revoke/route.ts has a category guard so that commerce and consumer
 * contracts cannot be ended by one party alone — correct, because repudiating a
 * commerce contract is not the same act as withdrawing an agent's authority. Amendment
 * cannot end anything either: its only terminal write is status='amended', which mints
 * a SUCCESSOR. Without this module, commerce and consumer contracts would have no path
 * to any ended state at all. This module is that path.
 *
 * The three defects in the sibling amendment routes that this deliberately does NOT
 * reproduce:
 *
 *  1. THREE NOTIONS OF "PARTY". amend/reject use live getCurrentHolders(); amendment
 *     approve authorizes against a frozen `approval_required_from` snapshot; revoke
 *     reads the stale `signatures` table plus payer_wallet. After a novation these
 *     disagree about who may act. Here there is one: live holders, always.
 *
 *  2. UNSIGNED WALLET STRINGS. `proposer_wallet` and `rejecter_wallet` are accepted on
 *     nothing but membership in a holder set that GET /amendments publishes without
 *     auth. Here the signature IS the credential and the address is derived from it.
 *
 *  3. ONE VERB FOR EVERY DECISION. A harvested "approve" signature is replayable as
 *     anything else the route accepts. Here each decision demands its own verb.
 */

/** Why the proposer says the contract should end. An assertion, never a finding. */
export type TerminationGround = 'convenience' | 'cause' | 'mutual';

/** What a responder is doing about an open proposal. */
export type TerminationDecision = 'accept' | 'decline' | 'withdraw';

/** Template families. `null` is treated as commerce — bilateral is the safe default. */
export type ContractCategory = 'delegation' | 'commerce' | 'consumer' | 'peer' | null;

export interface Refusal {
  ok: false;
  status: number;
  error: string;
  message: string;
}

const lc = (s: string | null | undefined): string => (s ?? '').toLowerCase();

const refuse = (status: number, error: string, message: string): Refusal => ({
  ok: false,
  status,
  error,
  message,
});

/* ------------------------------------------------------------------ *
 * 1. Message binding
 * ------------------------------------------------------------------ */

/**
 * Verbs that must appear for each decision, on top of the shared /terminat/i.
 *
 * This is the whole replay defence. Without distinct verbs, a signature the
 * counterparty produced to DECLINE could be submitted by anyone as an ACCEPT — same
 * hash, same proposal id, same wallet, and the route could not tell them apart. The
 * amendment family has one verb (/approv/i) for a flow with three outcomes.
 */
const DECISION_VERB: Record<TerminationDecision, RegExp> = {
  accept: /accept|agree/i,
  decline: /declin|reject|refus/i,
  withdraw: /withdraw|retract/i,
};

/** The exact phrase a commerce counterparty must sign to end the contract early. */
export const WAIVER_PHRASE = 'I waive the notice period';

/**
 * The signed message must name THIS contract, and THIS decision.
 *
 * Follows bindsToApproval (approval-auth.ts) — hash plus intent verb — and adds the
 * proposal id for responses, so a signature bound to one proposal cannot be replayed
 * against a later one on the same contract.
 */
export function bindsToTermination(
  message: string,
  contractHash: string,
  opts: { proposalId?: string; decision?: TerminationDecision } = {}
): boolean {
  if (!message || !contractHash) return false;
  if (!message.includes(contractHash)) return false;
  if (!/terminat/i.test(message)) return false;

  if (opts.proposalId) {
    if (!message.includes(opts.proposalId)) return false;
  }
  if (opts.decision) {
    if (!DECISION_VERB[opts.decision].test(message)) return false;
  }
  return true;
}

/**
 * Recover the signer and confirm it is the address the caller claimed.
 *
 * The claimed address is not trusted for anything — it exists so a mismatch is a
 * clear 401 rather than a silent authorization against an address nobody expected.
 */
export function verifySignedIntent(signed: {
  walletAddress: string;
  signature: string;
  message: string;
}): { ok: true; recovered: string } | Refusal {
  let recovered: string;
  try {
    recovered = verifyMessage(signed.message, signed.signature).toLowerCase();
  } catch {
    return refuse(401, 'invalid_signature', 'The signature could not be verified.');
  }
  if (recovered !== lc(signed.walletAddress)) {
    return refuse(
      401,
      'signature_mismatch',
      'The signature does not belong to the wallet address supplied.'
    );
  }
  return { ok: true, recovered };
}

/* ------------------------------------------------------------------ *
 * 2. Party oracle
 * ------------------------------------------------------------------ */

export interface PartySetInput {
  /** getCurrentHolders().currentHolders — lowercased addresses. */
  currentHolders: string[];
  /** getCurrentHolders().fromChain — false means it fell back to `signatures`. */
  fromChain: boolean;
  /** Whether the contract has cNFT token ids at all. */
  hasTokenIds: boolean;
}

/**
 * Decide whether the holder set may be relied on.
 *
 * getCurrentHolders() falls back to the stale `signatures` table when ownerOf()
 * throws (cnft-holders.ts:104-112). That is right for display and wrong for authority:
 * during a Base RPC outage it would let a wallet that has already transferred its
 * token away end the contract, and refuse the party who actually holds it now. So a
 * contract that SHOULD be resolvable on-chain but is not gets a retryable 503 rather
 * than a confident wrong answer. Legacy contracts with no token ids keep the fallback,
 * because for them the signatures table is not stale — it is the only record there is.
 */
export function resolvePartySet(
  input: PartySetInput
): { ok: true; holders: string[] } | Refusal {
  if (!input.fromChain && input.hasTokenIds) {
    return refuse(
      503,
      'holder_oracle_unavailable',
      'Current ownership could not be read from the chain, and this contract has ' +
        'on-chain tokens, so the fallback list may be out of date. Retry shortly.'
    );
  }

  const holders = input.currentHolders.map(lc).filter(Boolean);
  const unique = Array.from(new Set(holders));

  if (unique.length < 2) {
    return refuse(
      409,
      'single_party_contract',
      'This contract has fewer than two distinct parties, so there is no counterparty ' +
        'to agree to ending it.'
    );
  }
  return { ok: true, holders: unique };
}

/* ------------------------------------------------------------------ *
 * 3. Which door — unilateral or bilateral
 * ------------------------------------------------------------------ */

/** Categories that keep the unilateral revoke path (Art. 14 principal override). */
const UNILATERAL_CATEGORIES: ReadonlySet<string> = new Set(['delegation', 'peer']);

/** Contract statuses from which a bilateral termination may be started. */
const TERMINABLE_STATUSES: ReadonlySet<string> = new Set(['active', 'disputed']);

/**
 * Whether this contract belongs in the bilateral flow at all.
 *
 * The category gate is also what keeps `disputed` safe. The status trigger rejects
 * disputed -> revoked, so a delegation that reached `disputed` would become
 * unrevocable — an Article 14 regression. Confining the whole flow to commerce and
 * consumer means the trigger never has to change.
 */
export function terminationGate(input: {
  category: ContractCategory;
  status: string;
}): { ok: true } | Refusal {
  const category = input.category ?? null;

  if (category && UNILATERAL_CATEGORIES.has(category)) {
    return refuse(
      403,
      'unilateral_termination_available',
      `A ${category} contract is ended by the principal alone — withdrawing an agent's ` +
        'authority must not require the agent to agree. Use POST /revoke.'
    );
  }

  if (!TERMINABLE_STATUSES.has(input.status)) {
    return refuse(
      409,
      'invalid_status',
      `This contract is ${input.status}, so it cannot be terminated. Only active or ` +
        'disputed contracts can be ended.'
    );
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * 4. Who may do what
 * ------------------------------------------------------------------ */

/**
 * Entitlement, against the live holder set only.
 *
 * Never consulted here: approval_required_from, payer_wallet, the signatures table, or
 * contracts.principal_wallet. That is one notion of "party" rather than three.
 *
 * `withdraw` deliberately does not require current holding: retracting your own
 * consent can never harm the other side, and a party who novated out mid-proposal
 * should still be able to take their proposal off the table.
 */
export function entitle(input: {
  decision: TerminationDecision | 'propose';
  recovered: string;
  holders: string[];
  proposerWallet?: string | null;
}): { ok: true } | Refusal {
  const who = lc(input.recovered);
  const holders = input.holders.map(lc);
  const proposer = lc(input.proposerWallet);

  if (input.decision === 'withdraw') {
    if (who !== proposer) {
      return refuse(
        403,
        'not_the_proposer',
        'Only the party who proposed the termination can withdraw it.'
      );
    }
    return { ok: true };
  }

  if (!holders.includes(who)) {
    return refuse(
      403,
      input.decision === 'propose' ? 'proposer_not_party' : 'not_a_current_party',
      'The signing wallet is not a current party to this contract.'
    );
  }

  if ((input.decision === 'accept' || input.decision === 'decline') && who === proposer) {
    return refuse(
      403,
      'proposer_cannot_respond',
      'The party who proposed the termination cannot also respond to it. Use withdraw ' +
        'to take the proposal off the table.'
    );
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * 5. Notice period
 * ------------------------------------------------------------------ */

/** Hours in a year — the upper bound for a sane notice period. */
const MAX_NOTICE_HOURS = 8760;

export interface NoticeResult {
  hours: number;
  /** Which key the number came from, so the value is auditable rather than magic. */
  source: string;
}

const asFiniteNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Read the contract's own notice period.
 *
 * deriveCapabilities() is NOT reused here, despite parsing the same field. It
 * returns null for any contract without a delegation-shaped scope
 * (contract-capabilities.ts:103-111) — which is precisely the commerce and consumer
 * contracts this flow serves. Calling it would silently yield "no notice" on every
 * contract that matters. The field is read directly instead.
 *
 * Priority order, most specific first. `termination.*` wins over `revocation.*`
 * because a contract that states both means different things by them.
 */
export function noticeHoursFrom(
  machineReadable: unknown,
  parameters: unknown
): NoticeResult {
  const mr = (machineReadable ?? {}) as Record<string, unknown>;
  const params = (parameters ?? {}) as Record<string, unknown>;
  const termination = (mr.termination ?? {}) as Record<string, unknown>;
  const revocation = (mr.revocation ?? {}) as Record<string, unknown>;

  const candidates: Array<{ raw: number | null; source: string; multiplier: number }> = [
    { raw: asFiniteNumber(termination.notice_period_hours), source: 'machine_readable.termination.notice_period_hours', multiplier: 1 },
    { raw: asFiniteNumber(termination.notice_period_days), source: 'machine_readable.termination.notice_period_days', multiplier: 24 },
    { raw: asFiniteNumber(revocation.notice_period_hours), source: 'machine_readable.revocation.notice_period_hours', multiplier: 1 },
    { raw: asFiniteNumber(params.revocation_notice_hours), source: 'parameters.revocation_notice_hours', multiplier: 1 },
    { raw: asFiniteNumber(params.termination_notice_days), source: 'parameters.termination_notice_days', multiplier: 24 },
  ];

  for (const candidate of candidates) {
    if (candidate.raw === null) continue;
    const hours = candidate.raw * candidate.multiplier;
    if (hours < 0 || hours > MAX_NOTICE_HOURS) {
      // A stated but nonsensical period is not silently treated as "none" — the
      // source records that it was present and rejected.
      return { hours: 0, source: 'invalid' };
    }
    return { hours: Math.round(hours), source: candidate.source };
  }

  return { hours: 0, source: 'none' };
}

/**
 * Whether an acceptance is allowed right now, given the notice period.
 *
 * Signing IS receiving the notice, so the clock does not block acceptance outright.
 * But inside the window the acceptor must say, in signed text, that they are giving
 * up the notice the clause exists to give them.
 *
 * Except for consumer contracts, where no waiver is offered or accepted.
 * A signature proves who signed what; it never proves the law
 * gives it effect. Consumer-protection rights are commonly non-waivable, our consumer
 * templates recite four different jurisdictions, and Ambr is an evidence product —
 * producing an artefact that looks strong and is void is worse than producing none.
 * The same principle is already encoded in the A-series templates, which may not
 * exclude liability for negligence or death however the parties word it.
 */
export function noticeAcceptance(input: {
  category: ContractCategory;
  noticeHours: number;
  effectiveAt: Date;
  now: Date;
  message: string;
}): { ok: true; waived: boolean } | Refusal {
  const withinWindow =
    input.noticeHours > 0 && input.now.getTime() < input.effectiveAt.getTime();

  if (!withinWindow) return { ok: true, waived: false };

  if (input.category === 'consumer') {
    return refuse(
      403,
      'notice_period_not_waivable',
      `This is a consumer contract, so its notice period cannot be waived. The ` +
        `termination can be accepted from ${input.effectiveAt.toISOString()}.`
    );
  }

  if (!input.message.includes(WAIVER_PHRASE)) {
    return refuse(
      400,
      'notice_waiver_required',
      `The notice period runs until ${input.effectiveAt.toISOString()}. To accept ` +
        `before then, the signed message must contain the exact phrase ` +
        `"${WAIVER_PHRASE}".`
    );
  }

  return { ok: true, waived: true };
}

/**
 * The exact string the counterparty should sign.
 *
 * Handing this back is not a convenience. Message-binding schemes fail in practice
 * because the other side guesses the wording and the signature is refused with no
 * indication of what was wrong.
 */
export function acceptanceMessageTemplate(input: {
  contractRef: string;
  contractHash: string;
  proposalId: string;
  category: ContractCategory;
  noticeHours: number;
  effectiveAt: Date;
  now: Date;
}): string {
  const base =
    `I accept and agree to terminate Ambr contract ${input.contractRef} ` +
    `(hash ${input.contractHash}), termination proposal ${input.proposalId}.`;

  const waiverNeeded =
    input.category !== 'consumer' &&
    input.noticeHours > 0 &&
    input.now.getTime() < input.effectiveAt.getTime();

  return waiverNeeded ? `${base} ${WAIVER_PHRASE}.` : base;
}

/* ------------------------------------------------------------------ *
 * 6. Effective date
 * ------------------------------------------------------------------ */

export function effectiveAtFrom(createdAt: Date, noticeHours: number): Date {
  return new Date(createdAt.getTime() + noticeHours * 3600_000);
}
