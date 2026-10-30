/**
 * Lightweight contract preview generator for the chat-driven deploy flow.
 *
 * NOT a contract generator — we use Haiku for that at deploy time
 * (POST /api/v1/contracts). This module produces a human-readable
 * SKETCH of what the final contract will look like, with placeholders
 * for missing fields. Updates live as the user fills in parameters
 * via chat. Zero LLM cost, zero latency.
 *
 * For v1, supports the three chat-driven templates: A1, D1, C1.
 */

import { V1_CHAT_TEMPLATES } from '@/lib/llm/prompts';
import { LIMIT_FIELDS, capsPhrase, formatLimit } from '@/lib/deploy/optional-limits';

export const TEMPLATE_PRICING_USD: Record<string, number> = {
  'a1-service-purchase': 0.20,
  'd1-general-auth': 0.50,
  'c1-api-access': 1.00,
  'p2-power-of-attorney': 0.20,
  'c3-task-execution': 1.00,
};

export const TEMPLATE_NAMES: Record<string, string> = {
  'a1-service-purchase': 'A1 — Service Purchase Agreement',
  'd1-general-auth': 'D1 — General Agent Authorization',
  'c1-api-access': 'C1 — API Access Agreement',
  'p2-power-of-attorney': 'P2 — Power of Attorney',
  'c3-task-execution': 'A2A — Agent-to-Agent Agreement',
};

interface PreviewSection {
  label: string;
  field: string;
  format?: 'currency' | 'duration' | 'days' | 'wallet' | 'percent';
  /**
   * True when the field is optional (not in the template's required list,
   * may have a server-side default or jurisdiction-conditional behaviour).
   * Optional rows render with a visual "(optional)" suffix and are excluded
   * from the "X of Y fields filled" counter so the deploy-readiness signal
   * doesn't contradict the agent's "ready to deploy" message.
   */
  optional?: boolean;
  /**
   * On-demand rows render ONLY once they have a value — they never show as a
   * permanent "⌽ awaiting…" placeholder. Use for agent-offered opt-in fields
   * (e.g. P2 spending caps): the Ambr Agent asks if the client wants them, and
   * the row materialises in the preview only after the client opts in. Implies
   * optional. Without a value the row is skipped entirely.
   */
  onDemand?: boolean;
  /**
   * Plain-English hint shown as a small subtitle below the label. Helps
   * non-lawyer users understand what each field actually represents
   * ("Consumer" → "Buyer — who's paying"). Optional; omit when the label
   * is self-explanatory.
   */
  hint?: string;
}

const PREVIEW_SECTIONS: Record<string, PreviewSection[]> = {
  'a1-service-purchase': [
    { label: 'Buyer',          field: 'consumer_name',     hint: "Who's buying (your client)" },
    { label: "Buyer's email",  field: 'consumer_email',    hint: 'Where they receive the contract link' },
    // Optional buyer-side wallet. Auto-filled by DeployChat from the user's
    // connected SafePal/MetaMask the moment the A1 template is selected, so
    // the user doesn't need to type it. Marked optional because A1 still
    // supports email-only consumers (B2C magic-link signing path).
    { label: "Buyer's wallet", field: 'consumer_agent_id', format: 'wallet', optional: true, hint: 'Yours — signs on the buyer side. Auto-filled from your connected wallet.' },
    { label: 'Seller',         field: 'provider_name',     hint: "Who's selling (you, or your company)" },
    { label: "Seller's wallet", field: 'provider_agent_id', format: 'wallet', hint: 'Signs on the seller side (0x… address)' },
    { label: 'What is being sold', field: 'service_description', hint: 'Product, service, or deliverable' },
    { label: 'Price',          field: 'fee',               format: 'currency', hint: 'Amount the buyer pays' },
    { label: 'Currency',       field: 'currency',          hint: 'USD, EUR, USDC, etc.' },
    { label: 'Delivery time',  field: 'delivery_timeline', hint: 'When the buyer receives it' },
    { label: 'Refund terms',   field: 'refund_policy',     hint: 'When and how a refund applies' },
    // Cooling-off is jurisdiction-conditional (EU/UK require 14 days; Singapore
    // and many other jurisdictions have no general consumer cooling-off regime).
    // Marked optional here so the field counter and Deploy button don't gate on
    // it. The template prompt still applies a 14-day default if unset — that
    // default is EU-biased and needs a jurisdiction matrix to be fully correct
    // (see pending_ambr_cooling_off_jurisdiction_matrix.md).
    { label: 'Cancellation window', field: 'cooling_off_days', format: 'days', optional: true, hint: 'Days the buyer can cancel without penalty' },
    { label: 'Legal jurisdiction', field: 'governing_law', hint: "Which country's law governs disputes" },
  ],
  'd1-general-auth': [
    { label: 'Authorizer',     field: 'principal_name',    hint: 'Who is giving permission to the agent' },
    // Optional principal-side wallet. Same auto-fill pattern as A1's buyer
    // wallet — pulled from the user's connected wallet when D1 is picked.
    // The Authorizer SIGNS the delegation with this wallet; the existing
    // `agent_id` field is the delegatee agent's wallet (different party).
    { label: "Authorizer's wallet", field: 'principal_agent_id', format: 'wallet', optional: true, hint: 'Yours — signs the authorization. Auto-filled from your connected wallet.' },
    { label: 'Authorizer type', field: 'principal_type',   hint: 'Individual or company' },
    { label: 'Registration no.', field: 'principal_registration_number', hint: 'Company / national ID number' },
    { label: 'Address',        field: 'principal_address', hint: 'Legal address of the authorizer' },
    { label: "Agent's wallet", field: 'agent_id',          format: 'wallet', hint: 'The AI agent acting on the authorizer\'s behalf' },
    { label: 'What the agent can do', field: 'scope',      hint: 'Permitted activities' },
    { label: 'Allowed categories', field: 'categories',    hint: 'Comma-separated list (e.g. travel, compute)' },
    { label: 'Per-transaction limit', field: 'spending_limit_per_tx', format: 'currency', hint: 'Max single spend' },
    { label: 'Monthly limit',  field: 'spending_limit_monthly', format: 'currency', hint: 'Max cumulative monthly spend' },
    { label: 'Valid for',      field: 'duration_months',   format: 'duration', hint: 'Authorization duration' },
    { label: 'Legal jurisdiction', field: 'governing_law', hint: "Which country's law governs disputes" },
  ],
  // P2 mirrors D1's identity + scope rows but is one-sided: the user signs
  // once, contract activates immediately, no counterparty cNFT mints. The
  // spending-limit rows are kept as optional helpers — power of attorney is
  // broader than D1's capped delegation but users can still narrow it.
  'p2-power-of-attorney': [
    { label: 'Principal',      field: 'principal_name',    hint: 'You — the person granting power of attorney' },
    { label: "Your wallet",    field: 'principal_agent_id', format: 'wallet', optional: true, hint: 'You sign once with this wallet. Auto-filled from your connected wallet.' },
    { label: 'Principal type', field: 'principal_type',   hint: 'Individual or company' },
    { label: 'Registration no.', field: 'principal_registration_number', hint: 'Company / national ID number' },
    { label: 'Address',        field: 'principal_address', hint: 'Your legal address' },
    { label: "Agent's wallet", field: 'agent_id',          format: 'wallet', hint: 'The AI agent receiving the authority (a SEPARATE wallet from yours)' },
    { label: 'Agent type',     field: 'agent_type',        hint: 'Autonomous, supervised, or semi-autonomous' },
    { label: 'What the agent can do', field: 'scope',      hint: 'Permitted activities under this POA' },
    { label: 'Valid for',      field: 'duration_months',   format: 'duration', hint: 'POA duration in months' },
    { label: 'Legal jurisdiction', field: 'governing_law', hint: "Which country's law governs the POA" },
    // Optional spending caps — ALWAYS visible (2026-07-17: they were onDemand —
    // hidden until valued — so a tester authorized a *trading* agent via POA and
    // never learned caps exist). Optional: they don't gate the counter/Deploy.
    // When set they flow into the contract's FINANCIAL LIMITS clause (see
    // prompts.ts P2 generation prompt); absent, the POA is general within scope.
    { label: 'Per-transaction limit', field: 'spending_limit_per_tx', format: 'currency', optional: true, hint: 'Optional — tell the agent, e.g. "cap it at $500 per transaction"' },
    { label: 'Monthly limit',  field: 'spending_limit_monthly', format: 'currency', optional: true, hint: 'Optional — e.g. "monthly limit $5,000"; blank keeps the POA general within scope' },
  ],
  'c1-api-access': [
    { label: 'Buyer (API consumer)', field: 'buyer_name', hint: 'The entity authorising API consumption' },
    // In C1 the "buyer" is acting through its AI agent — that agent is the one
    // making API calls and paying via x402. The field IS the agent's wallet,
    // not a separate human/entity wallet. Label clarifies the entity-vs-agent
    // distinction a tester flagged on 2026-05-25.
    { label: "Buyer's agent wallet", field: 'buyer_agent_id', format: 'wallet', hint: 'The AI agent that will make API calls — pays per call via x402 (0x… address). Auto-filled from your connected wallet.' },
    { label: 'Seller (API provider)', field: 'seller_name', hint: 'Who is serving the API' },
    { label: 'API URL',        field: 'api_endpoint',     hint: 'Endpoint the buyer calls' },
    { label: 'Billing model',  field: 'pricing_model',    hint: 'pay-per-call, subscription, etc.' },
    { label: 'Cost per request', field: 'price_per_call', format: 'currency', hint: 'Charge for each API call' },
    { label: 'Currency',       field: 'currency',         hint: 'USD, EUR, USDC, etc.' },
    { label: 'Uptime SLA',     field: 'sla_uptime_percent', format: 'percent', hint: 'Guaranteed availability (e.g. 99.9%)' },
    { label: 'Legal jurisdiction', field: 'governing_law', hint: "Which country's law governs disputes" },
  ],
  // A2A — Agent-to-Agent (c3-task-execution): a requester agent engages an
  // executor agent for a deliverable, payment on completion. Both agents sign.
  'c3-task-execution': [
    { label: 'Requester',      field: 'requester_name',     hint: 'Who commissions the task' },
    { label: "Requester's agent wallet", field: 'requester_agent_id', format: 'wallet', hint: 'The requesting AI agent (0x… on Base L2). Auto-filled from your connected wallet.' },
    { label: 'Executor',       field: 'executor_name',      hint: 'The agent that does the work' },
    { label: "Executor's agent wallet", field: 'executor_agent_id', format: 'wallet', hint: 'The executing AI agent — a SEPARATE 0x… address' },
    { label: 'Task',           field: 'task_description',    hint: 'What needs to be done' },
    { label: 'Deliverables',   field: 'deliverables',        hint: 'What the executor must produce' },
    { label: 'Acceptance criteria', field: 'acceptance_criteria', hint: 'How completion is judged' },
    { label: 'Price',          field: 'total_price',         format: 'currency', hint: 'Total paid on completion' },
    { label: 'Currency',       field: 'currency',            hint: 'USD, EUR, USDC, etc.' },
    { label: 'Deadline',       field: 'deadline',            hint: 'When the work is due' },
    { label: 'Legal jurisdiction', field: 'governing_law',   hint: "Which country's law governs disputes" },
  ],
};

function formatValue(value: unknown, format?: 'currency' | 'duration' | 'days' | 'wallet' | 'percent'): string {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  switch (format) {
    case 'currency':
      return typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : str;
    case 'duration':
      return /^\d+$/.test(str) ? `${str} ${Number(str) === 1 ? 'month' : 'months'}` : str;
    case 'days':
      return /^\d+$/.test(str) ? `${str} ${Number(str) === 1 ? 'day' : 'days'}` : str;
    case 'wallet':
      return str.length > 12 ? `${str.slice(0, 6)}…${str.slice(-4)}` : str;
    case 'percent':
      return /^\d+(\.\d+)?$/.test(str) ? `${str}%` : str;
    default:
      return str;
  }
}

/**
 * A spending cap as the preview shows it: the amount when it is one. A value
 * that is not an amount ("none", "no limit") shows as "No limit" on an optional
 * cap and as unfilled on a required one, where it does not satisfy the field.
 */
function formatCap(value: unknown, optional: boolean | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = formatLimit(value);
  if (amount) return amount;
  return optional ? 'No limit' : '';
}

const isLimitField = (field: string): boolean => (LIMIT_FIELDS as readonly string[]).includes(field);

export interface PreviewRow {
  label: string;
  field: string;
  value: string;
  isFilled: boolean;
  /** Mirrors PreviewSection.optional — drives counter exclusion + label suffix. */
  optional?: boolean;
  /** Plain-English subtitle shown below the label so users understand
   *  what each legal/abstract term means in everyday language. */
  hint?: string;
  /** Format hint exposed so the preview pane can swap in a specialised
   *  control for wallet rows (WalletFieldControl). Mirrors PreviewSection.format. */
  format?: 'currency' | 'duration' | 'days' | 'wallet' | 'percent';
}

export function buildPreview(
  template: string | null,
  params: Record<string, unknown>,
): { templateName: string | null; priceUsd: number | null; rows: PreviewRow[]; introText: string } {
  if (!template) {
    return {
      templateName: null,
      priceUsd: null,
      rows: [],
      introText:
        'Your contract will appear here as we talk. Tell Ambr Agent what you need — for example: "I want to let my AI assistant book flights up to $2,000 per trip" — and the preview will fill in live.',
    };
  }

  const sections = PREVIEW_SECTIONS[template] ?? [];
  const rows: PreviewRow[] = sections
    // On-demand rows (e.g. P2 optional spending caps the agent offers) only
    // appear once the client has opted in and provided a value — they never
    // clutter the preview as permanent "⌽ awaiting…" rows.
    .filter((s) => !s.onDemand || formatValue(params[s.field], s.format) !== '')
    .map((s) => {
      const value = params[s.field];
      const formatted = isLimitField(s.field) ? formatCap(value, s.optional) : formatValue(value, s.format);
      return {
        label: s.label,
        field: s.field,
        value: formatted || '⌽ awaiting…',
        isFilled: formatted !== '',
        optional: s.optional,
        hint: s.hint,
        format: s.format,
      };
    });

  const introText = getTemplateIntro(template, params);

  return {
    templateName: TEMPLATE_NAMES[template] ?? template,
    priceUsd: TEMPLATE_PRICING_USD[template] ?? null,
    rows,
    introText,
  };
}

function getTemplateIntro(template: string, params: Record<string, unknown>): string {
  switch (template) {
    case 'a1-service-purchase': {
      const consumer = params.consumer_name as string | undefined;
      const service = params.service_description as string | undefined;
      const provider = params.provider_name as string | undefined;
      return [
        consumer ? `${consumer}` : '[Consumer]',
        ' agrees to purchase ',
        service ? `"${service}"` : '[service description]',
        ' from ',
        provider ? provider : '[provider]',
        ' under the terms below, with full consumer protection including cooling-off, refund, and GDPR data handling.',
      ].join('');
    }
    case 'd1-general-auth': {
      const principal = params.principal_name as string | undefined;
      const agentId = params.agent_id as string | undefined;
      const scope = params.scope as string | undefined;
      const monthlyCap = formatLimit(params.spending_limit_monthly);
      return [
        principal ? `${principal}` : '[Principal]',
        ' hereby authorizes the AI agent identified by wallet ',
        agentId ? `${agentId.slice(0, 6)}…${agentId.slice(-4)}` : '[agent wallet]',
        ' to act on its behalf within the scope of ',
        scope ? `"${scope}"` : '[delegation scope]',
        monthlyCap ? ` and a monthly spending cap of ${monthlyCap}` : '',
        '. Any electronic signature created by the Agent within this scope shall be deemed the act of the Principal.',
      ].join('');
    }
    case 'c1-api-access': {
      const buyer = params.buyer_name as string | undefined;
      const seller = params.seller_name as string | undefined;
      const api = params.api_endpoint as string | undefined;
      return [
        buyer ? `${buyer}` : '[Buyer]',
        ' (acting through its AI agent) agrees to access the API ',
        api ? `"${api}"` : '[API endpoint]',
        ' provided by ',
        seller ? seller : '[seller]',
        ' under the pricing, rate-limit, and SLA terms below. Payments may be settled via x402 with the contract hash in payment metadata.',
      ].join('');
    }
    case 'p2-power-of-attorney': {
      const principal = params.principal_name as string | undefined;
      const agentId = params.agent_id as string | undefined;
      const scope = params.scope as string | undefined;
      const months = params.duration_months;
      const capClause = capsPhrase(params.spending_limit_per_tx, params.spending_limit_monthly);
      const caps = capClause ? `, ${capClause}` : '';
      return [
        principal ? `${principal}` : '[Principal]',
        ' grants Power of Attorney to the AI agent identified by wallet ',
        agentId ? `${agentId.slice(0, 6)}…${agentId.slice(-4)}` : '[agent wallet]',
        ' to act on the Principal\'s behalf within the scope of ',
        scope ? `"${scope}"` : '[POA scope]',
        months ? ` for ${months} months` : '',
        caps,
        '. This is a unilateral grant — only the Principal signs; activates immediately on signing.',
      ].join('');
    }
    case 'c3-task-execution': {
      const requester = params.requester_name as string | undefined;
      const executor = params.executor_name as string | undefined;
      const task = params.task_description as string | undefined;
      const price = params.total_price;
      const currency = (params.currency as string | undefined) ?? 'USD';
      return [
        requester ? `${requester}` : '[Requester]',
        ' engages ',
        executor ? `${executor}` : '[Executor agent]',
        ' to ',
        task ? `"${task}"` : '[task]',
        price ? `, for ${price} ${currency} on completion` : '',
        '. An agent-to-agent agreement — both agents sign; payment settles when the deliverables meet the acceptance criteria.',
      ].join('');
    }
    default:
      return '';
  }
}

export function templateOptionsForChips() {
  return V1_CHAT_TEMPLATES;
}
