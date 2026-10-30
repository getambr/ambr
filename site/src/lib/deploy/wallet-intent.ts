import { AGENT_WALLET_FIELD_BY_TEMPLATE, OWN_WALLET_FIELD_BY_TEMPLATE } from './request';
import { type ChatMessage, userTypedTexts } from './user-text';

/**
 * Wallets a user states in their own chat messages.
 *
 * Only text the user typed is read (see userTypedTexts): the model's words,
 * assistant messages and model-written intents never state a wallet for the
 * user. An address is attributed to a side only when an explicit label is
 * attached to it, either in front ("my wallet: 0x..") or behind ("use 0x.. as my
 * wallet"). The label must not be negated ("not my wallet"), and an address
 * whose labels disagree is attributed to nobody: a wrong attribution changes who
 * may sign the contract. A bare role label ("owner wallet") counts as the user's
 * own only when nothing in front of it names another party ("the executor's
 * owner wallet", "their principal wallet"); only "my ..." carries its owner.
 */

const ADDRESS = String.raw`(0x[a-fA-F0-9]{40})(?![a-fA-F0-9])`;
const LINK = String.raw`\s*(?:is|=|:|-|–|—)?\s*(?:is\s+)?`;

const OWN_LABEL = String.raw`(?:my\s+(?:own\s+|signing\s+|main\s+|personal\s+)?(?:wallet|address)(?:\s+address)?|(?:authori[sz]er|principal|owner|signer)(?:['’]s)?\s+(?:signing\s+)?(?:wallet|address)(?:\s+address)?|(?:wallet|address)\s+of\s+(?:the\s+)?(?:authori[sz]er|principal|owner|signer))`;
const AGENT_LABEL = String.raw`(?:(?:ai\s+)?agent(?:['’]s)?\s+(?:wallet|address)(?:\s+address)?|agent_id|(?:wallet|address)\s+of\s+(?:the\s+|my\s+)?(?:ai\s+)?agent)`;

// A label followed by its address: "my wallet: 0x..".
const LABEL_RE = new RegExp(String.raw`\b(?:(?<own>${OWN_LABEL})|(?<agent>${AGENT_LABEL}))`, 'gi');
const LINKED_ADDRESS_RE = new RegExp(`${LINK}${ADDRESS}`, 'y');
// An address followed by its label: "use 0x.. as my wallet".
const ADDRESS_FIRST_RE = new RegExp(
  String.raw`${ADDRESS}\s+(?:as|is|will\s+be|should\s+be)\s+(?:(?:the|my)\s+)?(?:(?<own>${OWN_LABEL})|(?<agent>${AGENT_LABEL}))\b`,
  'gi',
);

// Words that turn the label after them into the opposite claim: "not my wallet",
// "isn't my wallet", "other than my wallet".
const NEGATION_RE = /(?:\bnot|n['’]t|\bnever|\bnor|\bother than|\brather than|\binstead of|\bexcept|\bapart from|\bbesides)\s+(?:\w+\s+)?$/i;
const NEGATION_WINDOW = 40;

type Side = 'own' | 'agent';

interface Candidate {
  at: number;
  side: Side;
  address: string;
  negated: boolean;
}

export interface StatedWallets {
  own: string | null;
  agent: string | null;
}

// Words in front of a bare role label ("owner wallet") that tie it to someone
// else: a possessive ("the executor's owner wallet"), a pronoun ("their
// principal wallet") or a counterparty role ("provider owner wallet"). A
// contraction ("here's the owner wallet") is not a possessive.
const OTHER_PARTY_RE =
  /(?:\b(?!(?:it|that|here|there|what|who|let|he|she)['’]s\b)\w+['’]s|\b(?:their|his|her|its|counterparty|provider|executor|requester|seller|buyer|vendor|other|another))\s+(?:[\w-]+\s+){0,2}$/i;

function isNegated(text: string, labelStart: number): boolean {
  return NEGATION_RE.test(text.slice(Math.max(0, labelStart - NEGATION_WINDOW), labelStart));
}

/**
 * True when a bare role label ("owner wallet", "signer address") is tied to
 * another party by the words before it, within the same clause. Only "my ..."
 * labels carry their own owner, so a bare label is the user's own wallet only
 * when nothing names someone else in front of it.
 */
function namesOtherParty(text: string, labelStart: number): boolean {
  const before = text.slice(Math.max(0, labelStart - NEGATION_WINDOW), labelStart);
  const clause = before.split(/[.,;:!?\n]/).at(-1) ?? '';
  return OTHER_PARTY_RE.test(clause);
}

function candidatesIn(text: string): Candidate[] {
  const found: Candidate[] = [];

  for (const m of text.matchAll(LABEL_RE)) {
    const end = m.index + m[0].length;
    LINKED_ADDRESS_RE.lastIndex = end;
    const linked = LINKED_ADDRESS_RE.exec(text);
    if (!linked) continue;
    const own = m.groups?.own;
    found.push({
      at: end + linked[0].length - linked[1].length,
      side: own ? 'own' : 'agent',
      address: linked[1],
      negated: isNegated(text, m.index) || (!!own && !/^my\b/i.test(own) && namesOtherParty(text, m.index)),
    });
  }

  for (const m of text.matchAll(ADDRESS_FIRST_RE)) {
    found.push({
      at: m.index,
      side: m.groups?.own ? 'own' : 'agent',
      address: m[1],
      negated: isNegated(text, m.index),
    });
  }
  return found;
}

/** The wallets one text attributes to a side, oldest first. */
function statementsIn(text: string): { side: Side; address: string }[] {
  const byAddress = new Map<number, Candidate[]>();
  for (const c of candidatesIn(text)) byAddress.set(c.at, [...(byAddress.get(c.at) ?? []), c]);

  const out: { side: Side; address: string; at: number }[] = [];
  for (const [at, group] of byAddress) {
    const sides = new Set(group.map((c) => c.side));
    // A negated label, or labels that disagree about one address, settle nothing.
    if (group.some((c) => c.negated) || sides.size !== 1) continue;
    out.push({ at, side: group[0].side, address: group[0].address });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Every wallet the user attributed to a side, oldest first. */
export function statedWalletHistory(messages: readonly ChatMessage[]): { own: string[]; agent: string[] } {
  const history: { own: string[]; agent: string[] } = { own: [], agent: [] };
  for (const text of userTypedTexts(messages)) {
    for (const s of statementsIn(text)) history[s.side].push(s.address);
  }
  return history;
}

/** The newest labelled own and agent wallets in the user's messages, each as typed. */
export function extractStatedWallets(messages: readonly ChatMessage[]): StatedWallets {
  const history = statedWalletHistory(messages);
  return { own: history.own.at(-1) ?? null, agent: history.agent.at(-1) ?? null };
}

function sameWallet(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The value to write into the own-wallet field, or null to leave it alone.
 *
 * `lastAuto` is the value the UI itself last wrote there; `adopted` is a
 * connected wallet found in the field that the UI did not write (a restored
 * draft, or one the model or the user put there); `statedHistory` is every
 * wallet the user has attributed to themselves in chat, oldest first.
 *
 * The latest wallet the user stated wins over the connected one, and over an
 * earlier stated one (a correction). It replaces only a field that is empty,
 * holds what the UI wrote, or holds an earlier stated wallet; a value of any
 * other origin is never replaced by text. An adopted value only follows the
 * connected wallet when it changes, and only while the user has stated none.
 */
export function resolveOwnWalletField(input: {
  current: string | undefined | null;
  lastAuto: string | undefined;
  adopted?: string | undefined;
  stated: string | null;
  statedHistory?: readonly string[];
  connected: string | null | undefined;
}): string | null {
  const { current, lastAuto, adopted, stated, statedHistory = [], connected } = input;
  const writtenByUi = !current || (lastAuto !== undefined && sameWallet(current, lastAuto));
  const adoptedHere = !!current && adopted !== undefined && sameWallet(current, adopted);
  const statedHere = !!current && statedHistory.some((w) => sameWallet(w, current));
  if (stated && !writtenByUi && !statedHere) return null;
  if (!writtenByUi && !statedHere && !adoptedHere) return null;
  const target = stated ?? connected ?? null;
  if (!target) return null;
  if (current && sameWallet(current, target)) return null;
  return target;
}

/** What the auto-fill remembers between runs, per field. */
export interface OwnWalletFillState {
  /** The connected wallet the UI itself last wrote into the field. */
  lastAuto?: string;
  /** A connected wallet found in the field that the UI did not write. */
  adopted?: string;
}

/**
 * One run of the own-wallet auto-fill: the value to write (null to leave the
 * field alone) and the state to carry into the next run.
 *
 * A field confirmed through a UI control is never touched. The field is
 * remembered as adopted when it holds the connected wallet without the UI having
 * written it, so a stated wallet cannot replace it while a later wallet switch
 * still can. A stated wallet written here is the user's own value, never
 * recorded as UI-written, so a later connected-wallet change does not undo it.
 */
export function decideOwnWalletFill(input: {
  current: string | undefined | null;
  state: OwnWalletFillState;
  stated: string | null;
  statedHistory?: readonly string[];
  connected: string | null | undefined;
  confirmed: boolean;
}): { write: string | null; state: OwnWalletFillState } {
  const { current, state, stated, statedHistory, connected, confirmed } = input;
  if (confirmed) return { write: null, state };

  const next: OwnWalletFillState = { ...state };
  const uiWritten = !!current && state.lastAuto !== undefined && sameWallet(current, state.lastAuto);
  if (connected && current && !uiWritten && sameWallet(current, connected)) next.adopted = connected;

  const write = resolveOwnWalletField({
    current,
    lastAuto: next.lastAuto,
    adopted: next.adopted,
    stated,
    statedHistory,
    connected,
  });
  if (write && (stated === null || !sameWallet(write, stated))) next.lastAuto = write;
  return { write, state: next };
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/**
 * A field the user's statement may fill: empty, or holding an earlier stated
 * wallet that the latest statement corrects. A value of any other origin (the
 * model's, or the user's through a control) is kept.
 */
function fillable(current: unknown, latest: string, earlier: readonly string[]): boolean {
  if (isEmpty(current)) return true;
  return typeof current === 'string' && !sameWallet(current, latest) && earlier.some((w) => sameWallet(w, current));
}

/**
 * Fills the template's own-wallet and agent-wallet fields from wallets the user
 * stated. The latest statement wins: it fills an empty field and corrects an
 * earlier stated wallet, but never replaces a value the model extracted or one
 * confirmed through a UI control.
 *
 * A delegation (D1) is two-sided, so one wallet never sits on both of its sides:
 * a stated wallet equal to the one already on the other side is not applied. A
 * power of attorney (P2) is one-sided and may use the same wallet for a local
 * agent, so it takes the same wallet on both fields.
 */
export function applyStatedWallets(input: {
  template: string | null;
  params: Record<string, unknown>;
  messages: readonly ChatMessage[];
  confirmedFields?: ReadonlySet<string>;
}): Record<string, unknown> {
  const { template, params, messages, confirmedFields } = input;
  if (!template) return params;
  const history = statedWalletHistory(messages);
  const stated = { own: history.own.at(-1) ?? null, agent: history.agent.at(-1) ?? null };
  const out: Record<string, unknown> = { ...params };
  const twoSided = template === 'd1-general-auth';

  const ownField = OWN_WALLET_FIELD_BY_TEMPLATE[template];
  const agentField = AGENT_WALLET_FIELD_BY_TEMPLATE[template];
  const takesAgent = twoSided || template === 'p2-power-of-attorney';

  if (ownField && stated.own && fillable(out[ownField], stated.own, history.own) && !confirmedFields?.has(ownField)) {
    const other = agentField && typeof out[agentField] === 'string' ? (out[agentField] as string) : null;
    const clash = twoSided && other !== null && sameWallet(other, stated.own);
    if (!clash) out[ownField] = stated.own;
  }

  if (takesAgent && agentField && stated.agent && fillable(out[agentField], stated.agent, history.agent) && !confirmedFields?.has(agentField)) {
    const own = ownField && typeof out[ownField] === 'string' ? (out[ownField] as string) : null;
    const clash = twoSided && own !== null && sameWallet(own, stated.agent);
    if (!clash) out[agentField] = stated.agent;
  }
  return out;
}
