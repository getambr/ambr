/**
 * Who may sign a contract, and who must have signed before it is in force.
 *
 * One notion of "party" for the sign route and the status route, so the two
 * cannot drift apart. A contract has at most two signing slots:
 *
 *   principal     the side that deploys: contracts.principal_wallet plus every
 *                 principal-side wallet field the templates define
 *   counterparty  the other side (absent on one-sided templates)
 *
 * A slot with declared wallets is filled only by one of those wallets. A slot
 * with none declared is OPEN and any wallet not claimed by the other side may
 * fill it; that keeps email-only counterparties (A1's optional buyer wallet,
 * C1's optional seller wallet) working as before.
 *
 * Who vouches for an OPEN slot at signing time (canSignAs). The wallet
 * signature proves only that the signer holds the wallet, and a contract's id
 * and hash are public, so on its own it would let a stranger become the party:
 *
 *   open principal slot     only the creator: the creating account's bound
 *                           wallet when it has one (its API key alone is then
 *                           refused: the agent usually holds the key), else
 *                           the creating API key; for an x402 contract (no
 *                           key) the wallet that paid
 *   open counterparty slot  only a holder of a full-access share token made
 *                           as an invite (POST /share, purpose 'invite'); the
 *                           deployer's own link is not one, and a request
 *                           carrying the creating key is never placed here
 *   declared wallet         keyless, as before
 *
 * This gates NEW signatures only. missingSlots, and so validity, still counts
 * every signature on file the same way, so a contract signed before the gate
 * keeps its standing.
 *
 * One-sided contracts (is_one_sided, e.g. the P2 power of attorney) have only
 * the principal slot, and it is never open: with neither a principal_wallet
 * nor a principal_agent_id on file nobody may sign.
 *
 * The zero address is never a signer: older deploys filled empty wallet fields
 * with it. And on a two-sided contract a principal_wallet that equals a
 * counterparty wallet, with no principal-side field naming it, is dropped: the
 * deploy flow once copied the counterparty's wallet into principal_wallet, and
 * honouring it would leave the real deployer unable to sign (amb-2026-0025 to
 * 0027).
 */

export type SignerSlot = 'principal' | 'counterparty';

/** Principal-side wallet fields, across every template. */
const PRINCIPAL_FIELDS = [
  'principal_agent_id', // D1/D2/P2 authorizer
  'consumer_agent_id', // A1 buyer
  'buyer_agent_id', // C1 buyer
  'client_agent_id', // C2 client
  'requester_agent_id', // C3 requester
] as const;

/** Counterparty-side wallet fields, across every template. */
const COUNTERPARTY_FIELDS = [
  'provider_agent_id', // A1, C2
  'seller_agent_id', // C1
  'executor_agent_id', // C3
  'agent_id', // D1/D2 delegatee (P2's agent does not sign: one-sided)
  'lead_agent_id', // D3 lead agent
] as const;

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_RE = /^0x0{40}$/;

/** Lowercased wallet, or null when not an address or the zero address. */
export function normalizeWallet(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const w = v.trim();
  if (!WALLET_RE.test(w) || ZERO_ADDRESS_RE.test(w)) return null;
  return w.toLowerCase();
}

export interface SignerParties {
  oneSided: boolean;
  /** Lowercased wallets allowed to sign as the principal; empty = open (two-sided only). */
  principal: string[];
  /** Lowercased wallets allowed to sign as the counterparty; empty = open. Unused when oneSided. */
  counterparty: string[];
}

export interface ContractSignerInput {
  principal_wallet?: string | null;
  is_one_sided?: boolean | null;
  parameters?: Record<string, unknown> | null;
}

function wallets(params: Record<string, unknown>, fields: readonly string[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const w = normalizeWallet(params[f]);
    if (w) out.push(w);
  }
  return out;
}

export function resolveSignerParties(contract: ContractSignerInput): SignerParties {
  const params = (contract.parameters ?? {}) as Record<string, unknown>;
  const principalWallet = normalizeWallet(contract.principal_wallet);

  if (contract.is_one_sided) {
    // The wallet captured at deploy time; failing that, the authorizer named in
    // the parameters (P2's principal_agent_id), which creation requires when no
    // principal_wallet is sent. Never open: with neither, nobody may sign.
    const authorizer = principalWallet ?? wallets(params, ['principal_agent_id'])[0] ?? null;
    return { oneSided: true, principal: authorizer ? [authorizer] : [], counterparty: [] };
  }

  const principalFieldWallets = wallets(params, PRINCIPAL_FIELDS);
  const counterparty = [...new Set(wallets(params, COUNTERPARTY_FIELDS))];
  // A principal_wallet that is really the counterparty's wallet (see header).
  const copiedFromCounterparty =
    principalWallet !== null &&
    counterparty.includes(principalWallet) &&
    !principalFieldWallets.includes(principalWallet);
  const principal = [
    ...(principalWallet && !copiedFromCounterparty ? [principalWallet] : []),
    ...principalFieldWallets,
  ];
  return { oneSided: false, principal: [...new Set(principal)], counterparty };
}

/**
 * A wallet that would sit on both sides of a two-sided contract, or null. Such
 * a contract can never complete: the wallet fills one slot and nobody else can
 * fill the other. Checked at creation, before any payment is taken. Callers
 * exempt one-sided templates.
 */
export function sharedWalletBothSides(input: {
  principal_wallet?: string | null;
  parameters?: Record<string, unknown> | null;
}): string | null {
  const params = (input.parameters ?? {}) as Record<string, unknown>;
  const principalSide = new Set(wallets(params, PRINCIPAL_FIELDS));
  const explicit = normalizeWallet(input.principal_wallet);
  if (explicit) principalSide.add(explicit);
  return wallets(params, COUNTERPARTY_FIELDS).find((w) => principalSide.has(w)) ?? null;
}

/**
 * The wallet the creating account brings to a two-sided contract that names no
 * principal-side wallet itself (see account-wallets.ts for which), or null.
 * Without one the principal slot is open and only the creator may fill it.
 * Never a wallet that would sit on both sides: that contract could not be
 * completed, so the slot stays open instead.
 */
export function principalWalletFromKey(
  input: { principal_wallet?: string | null; parameters?: Record<string, unknown> | null },
  keyWallet: string | null | undefined,
): string | null {
  const wallet = normalizeWallet(keyWallet);
  if (!wallet || input.principal_wallet) return null;
  const params = (input.parameters ?? {}) as Record<string, unknown>;
  if (wallets(params, PRINCIPAL_FIELDS).length > 0) return null;
  return sharedWalletBothSides({ principal_wallet: wallet, parameters: params }) ? null : wallet;
}

export function requiredSlots(parties: SignerParties): SignerSlot[] {
  return parties.oneSided ? ['principal'] : ['principal', 'counterparty'];
}

/** Slots with no declared wallet. Always empty on a one-sided contract: its principal is never open. */
export function openSlots(parties: SignerParties): SignerSlot[] {
  if (parties.oneSided) return [];
  return requiredSlots(parties).filter((s) => parties[s].length === 0);
}

function fillsSlot(parties: SignerParties, slot: SignerSlot, wallet: string): boolean {
  const w = wallet.toLowerCase();
  const declared = parties[slot];
  if (declared.length > 0) return declared.includes(w);
  // One-sided principal slot is never open.
  if (parties.oneSided) return false;
  // Open slot: any wallet the other side has not claimed.
  const other = slot === 'principal' ? parties.counterparty : parties.principal;
  return !other.includes(w);
}

/** Largest set of slots that distinct wallets can fill at once. */
function bestFill(parties: SignerParties, slots: SignerSlot[], signers: string[]): SignerSlot[] {
  if (slots.length === 0 || signers.length === 0) return [];
  const [slot, ...rest] = slots;
  // Option 1: leave this slot empty.
  let best = bestFill(parties, rest, signers);
  // Option 2: fill it with one of the signers.
  for (let i = 0; i < signers.length; i++) {
    if (!fillsSlot(parties, slot, signers[i])) continue;
    const others = signers.filter((_, j) => j !== i);
    const candidate = [slot, ...bestFill(parties, rest, others)];
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

/**
 * Slots still without a signature, given the wallets that have signed.
 *
 * `placed` is the slot a signature row records for its wallet (signatures.slot).
 * A recorded slot is filled by its own signer and nobody else; only signers
 * with no recorded slot (rows from before slots were recorded) are matched to
 * whichever slot they fit. Without `placed` every signer is matched that way,
 * which is how validity counts existing rows.
 */
export function missingSlots(
  parties: SignerParties,
  signedWallets: string[],
  placed: Record<string, SignerSlot> = {},
): SignerSlot[] {
  const signers = [...new Set(signedWallets.map((w) => w.toLowerCase()))];
  const slots = requiredSlots(parties).filter((s) => !signers.some((x) => placed[x] === s));
  const filled = bestFill(parties, slots, signers.filter((x) => !placed[x]));
  return slots.filter((s) => !filled.includes(s));
}

export type CanSign =
  | { ok: true; slot: SignerSlot }
  | {
      ok: false;
      /** Slots still waiting for a signature, for the error. */
      open: SignerSlot[];
      /** Open slots this wallet could fill but nothing vouches for it; absent when it is simply no party. */
      restricted?: SignerSlot[];
    };

/** What vouches for one signing request (see the header). */
export interface SignAuth {
  /** The creator's API key, or the wallet that paid for an x402 contract. Unlocks an open principal slot, never a counterparty one. */
  creator: boolean;
  /** A full-access share token for this contract. Unlocks an open counterparty slot, never a principal one. */
  invite: boolean;
}

/** Every open slot vouched for: party membership only. For tests; a route must pass the real auth. */
export const UNGATED: SignAuth = { creator: true, invite: true };

/**
 * May `wallet` add a signature, given who has signed already? Only when it
 * fills a slot that is still empty, and, for a slot with no declared wallet,
 * only when `auth` vouches for that slot. A wallet that is no party, or whose
 * slot is taken, is refused; so is one that could take only open slots it is
 * not vouched for (`restricted`). Where it could take either slot it takes the
 * one it is vouched for, the principal slot first.
 *
 * `placed` is the slot each earlier signer's row records (signatures.slot, one
 * row per slot per contract). Without it two open slots cannot be told apart:
 * an invitee who signed first could be counted as the principal, and a second
 * invite holder would then complete the contract as the counterparty without
 * the creator. Signers not in `placed` (rows from before slots were recorded)
 * are matched to whichever slot they fit.
 *
 * `auth` is required, so a caller cannot skip the gate by leaving it out.
 */
export function canSignAs(
  parties: SignerParties,
  signedWallets: string[],
  wallet: string,
  auth: SignAuth,
  placed: Record<string, SignerSlot> = {},
): CanSign {
  const w = wallet.toLowerCase();
  const signed = [...new Set(signedWallets.map((s) => s.toLowerCase()))];
  const slots = requiredSlots(parties).filter((s) => !signed.some((x) => placed[x] === s));
  const unplaced = signed.filter((x) => !placed[x]);
  const filled = bestFill(parties, slots, unplaced);
  const open = slots.filter((s) => !filled.includes(s));
  if (signed.includes(w)) return { ok: false, open };

  // A slot w can take without costing an earlier signer theirs.
  const takeable = slots.filter(
    (s) =>
      fillsSlot(parties, s, w) &&
      bestFill(parties, slots.filter((x) => x !== s), unplaced).length >= filled.length,
  );
  const vouched = (s: SignerSlot) =>
    parties[s].length > 0 || (s === 'principal' ? auth.creator : auth.invite);
  const slot = takeable.find(vouched);
  if (slot) return { ok: true, slot };
  return takeable.length > 0 ? { ok: false, open, restricted: takeable } : { ok: false, open };
}
