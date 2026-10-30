import { V1_CHAT_TEMPLATES } from '@/lib/llm/prompts';

/**
 * Which contract template a deploy-chat conversation is about, decided from the
 * user's own words and the parameters collected so far.
 *
 * The model picks the template first. These helpers decide when it picked none
 * or an unknown one, so a first message that describes a contract in plain
 * terms still locks a template. The rule they keep: a clear signal picks a
 * template, conflicting or absent signals pick none, and the user's chip choice
 * stays the way to resolve a tie.
 */

const P2 = 'p2-power-of-attorney';
const D1 = 'd1-general-auth';
const C3 = 'c3-task-execution';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Templates the chat can create; anything else a model returns is not a template. */
export const CHAT_TEMPLATE_SLUGS: readonly string[] = V1_CHAT_TEMPLATES.map((t) => t.slug);

/** The value when it names a template the chat can create, else null. */
export function validChatTemplate(value: unknown): string | null {
  return typeof value === 'string' && CHAT_TEMPLATE_SLUGS.includes(value) ? value : null;
}

// A one-sided grant to the user's own agent.
const P2_CUES: RegExp[] = [
  /authori[sz]e\s+(?:my|our|the)\s+(?:ai\s+|autonomous\s+)?(?:agent|assistant|bot)\b/i,
  /\bon my behalf\b/i,
  /\bmy\s+(?:ai\s+)?(?:agent|assistant|bot)\s+to\s+(?:buy|spend|pay|purchase|book|trade|act|sign|subscribe)\b/i,
  /\bagent type\b\W{0,3}(?:autonomous|supervised|semi-autonomous)\b/i,
];

// A real counterparty exchange.
const D1_CUES: RegExp[] = [
  /\bcounterparty\b/i,
  /\bbilateral\b/i,
  /\b(?:allowed|permitted|approved)\s+categories\b/i,
  /\bco-?sign/i,
];

// A question asks about the product; it does not describe the user's contract.
const QUESTION_START_RE = /^\s*(?:what|how|can|could|is|are|do|does|which|why|who|where|when)\b/i;

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text) || QUESTION_START_RE.test(text);
}

// Two agents transacting.
const C3_CUES: RegExp[] = [
  /\bhires?\s+(?:another|a second|an)\s+(?:ai\s+)?agent\b/i,
  /\b(?:executor|requester)\s+agent\b/i,
];

function explicitMention(userTexts: string[]): string | null {
  // Newest first, so the latest explicit statement wins.
  for (const text of [...userTexts].reverse()) {
    if (/power of attorney|\bP2\b/i.test(text)) return P2;
    if (/agent.?to.?agent|\bA2A\b|task execution|\bC3\b/i.test(text)) return C3;
    if (/\bdelegation\b|general (agent )?auth|\bD1\b/i.test(text)) return D1;
  }
  return null;
}

/** The templates whose wording cues appear in the statements (not questions) of the text. */
function cuedTemplates(userTexts: string[]): string[] {
  const text = userTexts.filter((t) => !isQuestion(t)).join('\n');
  const groups: [string, RegExp[]][] = [
    [P2, P2_CUES],
    [D1, D1_CUES],
    [C3, C3_CUES],
  ];
  return groups.filter(([, cues]) => cues.some((re) => re.test(text))).map(([slug]) => slug);
}

const PRINCIPAL_SIDE_FIELDS = [
  'principal_name',
  'principal_type',
  'principal_registration_number',
  'principal_address',
  'agent_id',
  'agent_type',
  'scope',
];

function has(params: Record<string, unknown>, key: string): boolean {
  const v = params[key];
  return v !== undefined && v !== null && v !== '';
}

/**
 * The template implied by which parameters were extracted. Principal and agent
 * fields mean a grant to an agent: a delegation when allowed categories are
 * present, else a one-sided power of attorney.
 */
export function inferTemplateFromParams(params: Record<string, unknown>): string | null {
  const keys = Object.keys(params).filter((k) => has(params, k));
  if (keys.some((k) => k.startsWith('requester_') || k.startsWith('executor_'))) return C3;
  if (PRINCIPAL_SIDE_FIELDS.some((k) => has(params, k))) return has(params, 'categories') ? D1 : P2;
  return null;
}

/**
 * The template the user named outright, or null. Wording cues and parameters
 * are not read: a reply that only answers a question must not lock a template,
 * because a locked template is never replaced.
 */
export function inferExplicitTemplate(messages: readonly ChatMessage[]): string | null {
  return explicitMention(messages.filter((m) => m.role === 'user').map((m) => m.content));
}

/**
 * The template the conversation points at, or null. An explicit mention in the
 * user's messages wins, then wording cues in statements (a question is not a
 * cue); cues that point at different templates give null. Parameters decide
 * only when the wording gives no signal. Used where the model is already
 * extracting fields; elsewhere only an explicit mention locks a template.
 */
export function inferTemplate(
  messages: readonly ChatMessage[],
  params: Record<string, unknown> = {},
): string | null {
  const userTexts = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const explicit = explicitMention(userTexts);
  if (explicit) return explicit;
  const cued = cuedTemplates(userTexts);
  if (cued.length === 1) return cued[0];
  if (cued.length > 1) return null;
  return inferTemplateFromParams(params);
}

/**
 * The template for this turn. One already locked is never replaced; otherwise
 * the model's pick when it is a real template, otherwise the inferred one.
 */
export function resolveTemplate(input: {
  templateSoFar: string | null;
  rawTemplate: unknown;
  messages: readonly ChatMessage[];
  params?: Record<string, unknown>;
}): string | null {
  return (
    input.templateSoFar ??
    validChatTemplate(input.rawTemplate) ??
    inferTemplate(input.messages, input.params)
  );
}

/** What to ask when a turn is not ready: the missing field, else a template choice, else a nudge. */
export function notReadyQuestion(input: { nextField: string | undefined; template: string | null }): string {
  const { nextField, template } = input;
  if (nextField) return `One more thing — what's the ${nextField.replace(/_/g, ' ')}?`;
  if (!template) {
    return 'Which kind of mandate is this — power of attorney (P2), delegation (D1), or agent-to-agent (A2A)? Pick one and I will fill the preview with what you have already told me.';
  }
  return 'Tell me the next detail, or click Deploy if everything looks right.';
}
