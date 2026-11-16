/**
 * Where the payment check reads an agreement's limits: the form answers stored
 * on the contract (`contracts.parameters`), whose keys are fixed by the
 * template's parameter_schema. `machine_readable` is free-form text written by
 * a language model, so it is never used to decide a limit; it is only
 * cross-checked, and the words in it are handed back to the caller (see
 * check-accounting.ts).
 *
 * This file is the single source of truth for what each template's keys mean.
 * Every key of a mapped template is accounted for in exactly one of:
 *   - `money`   an amount that is a rule (per transaction, monthly, ...)
 *   - `lists`   a list that is a rule (categories, actions, counterparties)
 *   - `other`   a key of a kind that cannot restrict a payment
 * A key in none of these makes the verdict incomplete, naming the key. The
 * drift test reads the templates' schemas from the migrations and fails when
 * this map and a schema disagree.
 */

export type MoneyRole =
  | 'per_transaction'
  | 'monthly'
  | 'approval'
  | 'escalation'
  | 'total'
  | 'price_per_call'
  | 'monthly_fee';

export type ListRole = 'categories' | 'permitted_actions' | 'restricted_actions' | 'counterparties' | 'milestones';

/**
 * Kinds of answer that cannot restrict a payment, and what the reader demands of each:
 *   identity  names, addresses, registration numbers, agent ids, wallets, governing law: text
 *   enum      a choice from a short list: text
 *   currency  a currency code
 *   date      a calendar date
 *   flag      yes or no
 *   count     a duration, a fleet size, a latency, a percentage: a number, zero or more
 *   text      free text describing the work: never read for meaning, listed in `not_checked`; a figure in it is a limit nothing explains
 *   text_list a list of free-text items, handled like `text`
 */
export type AnswerKind = 'identity' | 'enum' | 'currency' | 'date' | 'flag' | 'count' | 'text' | 'text_list';

export interface MoneyKey {
  role: MoneyRole;
  /** The template's schema requires this answer; a stored agreement without it cannot be read. */
  required?: true;
  /** The amount is in the template's own currency answer, not in USD. */
  inTemplateCurrency?: true;
  /** The rule can only be evaluated when this answer has one of these values (absent counts as `undefined`). */
  evaluableWhen?: { key: string; values: unknown[]; reason: string };
}

export interface TemplateRules {
  money: Record<string, MoneyKey>;
  lists: Record<string, { role: ListRole; required?: true }>;
  other: Record<string, AnswerKind>;
  /** The answer that names the currency of `inTemplateCurrency` amounts. */
  currencyKey?: string;
  /** The schema's default for `currencyKey`, used when no currency answer is stored (nothing server-side fills defaults in). */
  currencyDefault?: string;
  /** The answers that say when the agreement is in force (see the validity window in check-terms.ts). */
  window?: { start?: string; end?: string; months?: string };
  /** The answer that says when payment is released, and its schema default. */
  paymentModel?: { key: string; default: string };
}

/** Answers the dashboard fills in that are not in a template's schema. */
export const COMMON_ANSWERS: Record<string, AnswerKind> = {
  principal_agent_id: 'identity',
};

/** Amounts in these templates' limits are USD ("in USD" in the schema). */
export const USD = 'USD';

const delegationIdentity = {
  principal_name: 'identity',
  principal_type: 'enum',
  principal_registration_number: 'identity',
  governing_law: 'identity',
} as const satisfies Record<string, AnswerKind>;

export const TEMPLATE_RULES: Record<string, TemplateRules> = {
  // General agent authorization
  'd1-general-auth': {
    money: {
      spending_limit_per_tx: { role: 'per_transaction', required: true },
      spending_limit_monthly: { role: 'monthly', required: true },
      requires_approval_above: { role: 'approval' },
    },
    lists: { categories: { role: 'categories', required: true } },
    other: {
      ...delegationIdentity,
      principal_address: 'identity',
      agent_id: 'identity',
      agent_type: 'enum',
      scope: 'text',
      duration_months: 'count',
      revocation_notice_hours: 'count',
      sub_delegation_allowed: 'flag',
    },
    window: { months: 'duration_months' },
  },
  // One-sided power of attorney: the same optional limits as d1, no categories.
  'p2-power-of-attorney': {
    money: {
      spending_limit_per_tx: { role: 'per_transaction' },
      spending_limit_monthly: { role: 'monthly' },
      requires_approval_above: { role: 'approval' },
    },
    lists: {},
    other: {
      ...delegationIdentity,
      principal_address: 'identity',
      principal_agent_id: 'identity',
      agent_id: 'identity',
      agent_type: 'enum',
      scope: 'text',
      duration_months: 'count',
      revocation_clause: 'flag',
    },
    window: { months: 'duration_months' },
  },
  // Limited service agent: one total budget for the whole engagement.
  'd2-limited-service': {
    money: { budget_usd: { role: 'total', required: true } },
    lists: { permitted_counterparties: { role: 'counterparties' } },
    other: {
      ...delegationIdentity,
      agent_id: 'identity',
      service_description: 'text',
      start_date: 'date',
      end_date: 'date',
      reporting_frequency: 'enum',
      early_termination_allowed: 'flag',
    },
    window: { start: 'start_date', end: 'end_date' },
  },
  // Fleet authorization
  'd3-fleet-auth': {
    money: {
      shared_budget_monthly: { role: 'monthly', required: true },
      per_agent_tx_limit: { role: 'per_transaction' },
      escalation_threshold: { role: 'escalation', required: true },
    },
    lists: {
      permitted_actions: { role: 'permitted_actions' },
      restricted_actions: { role: 'restricted_actions' },
    },
    other: {
      ...delegationIdentity,
      lead_agent_id: 'identity',
      agent_class: 'identity',
      max_fleet_size: 'count',
      duration_months: 'count',
      audit_log_required: 'flag',
    },
    window: { months: 'duration_months' },
  },
  // API access: a price per call (per-call model only) and a monthly cap in USD.
  'c1-api-access': {
    money: {
      price_per_call: {
        role: 'price_per_call',
        required: true,
        inTemplateCurrency: true,
        evaluableWhen: {
          key: 'pricing_model',
          values: ['per-call'],
          reason: 'The price per call only describes a payment under the per-call pricing model.',
        },
      },
      monthly_cap_usd: { role: 'monthly' },
    },
    lists: {},
    other: {
      buyer_name: 'identity',
      buyer_agent_id: 'identity',
      seller_name: 'identity',
      seller_agent_id: 'identity',
      api_endpoint: 'identity',
      pricing_model: 'enum',
      currency: 'currency',
      rate_limit_rpm: 'count',
      sla_uptime_percent: 'count',
      sla_response_ms: 'count',
      data_retention_days: 'count',
      data_processing_location: 'text',
      governing_law: 'identity',
      x402_enabled: 'flag',
    },
    currencyKey: 'currency',
    currencyDefault: 'USDC',
  },
  // Compute and data processing SLA: a monthly fee, fixed unless the service scales.
  'c2-compute-sla': {
    money: {
      monthly_fee: {
        role: 'monthly_fee',
        required: true,
        inTemplateCurrency: true,
        evaluableWhen: {
          key: 'auto_scaling',
          values: [false, undefined],
          reason: 'The fee can scale with use, so the monthly fee is not a ceiling the check can compare against.',
        },
      },
    },
    lists: {},
    other: {
      client_name: 'identity',
      client_agent_id: 'identity',
      provider_name: 'identity',
      provider_agent_id: 'identity',
      service_description: 'text',
      resource_type: 'enum',
      currency: 'currency',
      sla_uptime_percent: 'count',
      sla_response_ms: 'count',
      auto_scaling: 'flag',
      max_scaling_multiplier: 'count',
      data_processing_location: 'text',
      data_deletion_on_termination: 'flag',
      breach_credit_percent: 'count',
      term_months: 'count',
      governing_law: 'identity',
    },
    currencyKey: 'currency',
    currencyDefault: 'USDC',
    window: { months: 'term_months' },
  },
  // Task execution: one total price; milestones are a payment schedule the check cannot match.
  'c3-task-execution': {
    money: { total_price: { role: 'total', required: true, inTemplateCurrency: true } },
    lists: { milestones: { role: 'milestones' } },
    other: {
      requester_name: 'identity',
      requester_agent_id: 'identity',
      executor_name: 'identity',
      executor_agent_id: 'identity',
      task_description: 'text',
      deliverables: 'text_list',
      acceptance_criteria: 'text',
      currency: 'currency',
      payment_model: 'enum',
      deadline: 'date',
      revision_rounds: 'count',
      ip_ownership: 'enum',
      confidentiality_required: 'flag',
      governing_law: 'identity',
    },
    currencyKey: 'currency',
    currencyDefault: 'USDC',
    paymentModel: { key: 'payment_model', default: 'on-completion' },
  },
};

/**
 * Other names the agreement's text may use for the same amount. A number in
 * `machine_readable` is explained only by a form answer of the same rule, at
 * the answer's own key or one of these. The same value under any other name is
 * not explained: it could be a different limit.
 */
export const ROLE_ALIASES: Record<MoneyRole, string[]> = {
  per_transaction: [
    'spending_limit_per_tx',
    'spending_limit_per_transaction',
    'per_transaction_limit',
    'per_tx_limit',
    'per_agent_tx_limit',
    'max_per_transaction',
    'per_transaction',
    'per_tx',
    'per_transaction_cap',
    'per_transaction_max',
    'per_transaction_maximum',
    'per_tx_cap',
    'transaction_limit',
    'transaction_cap',
    'max_transaction',
    'max_transaction_amount',
    'single_transaction_limit',
    'single_transaction_cap',
    'per_payment_limit',
    'per_payment_cap',
    'per_agent_transaction_limit',
    'per_agent_limit',
    'per_agent_cap',
    'per_agent_transaction_cap',
  ],
  monthly: [
    'spending_limit_monthly',
    'monthly_spending_limit',
    'monthly_limit',
    'monthly_cap',
    'monthly_cap_usd',
    'monthly_budget',
    'shared_budget_monthly',
    'monthly',
    'monthly_aggregate',
    'monthly_aggregate_cap',
    'monthly_aggregate_limit',
    'monthly_max',
    'monthly_maximum',
    'monthly_spend_cap',
    'monthly_spending_cap',
    'monthly_total',
    'shared_monthly_budget',
    'shared_budget',
    'fleet_monthly_budget',
    'fleet_budget',
    'aggregate_monthly_cap',
  ],
  approval: [
    'requires_approval_above',
    'approval_threshold',
    'approval_required_above',
    'approval',
    'approval_above',
    'approval_limit',
    'human_approval_threshold',
    'human_approval_above',
    'approval_required_threshold',
  ],
  escalation: ['escalation_threshold', 'escalation', 'escalation_above', 'escalation_limit', 'escalation_required_above'],
  total: [
    'budget_usd',
    'total_budget',
    'budget',
    'total_price',
    'total_amount',
    'total_fee',
    'total_compensation',
    'fixed_budget',
    'fixed_price',
  ],
  price_per_call: ['price_per_call', 'unit_price', 'price_per_request', 'per_call_price', 'per_call_fee', 'price_per_api_call'],
  monthly_fee: ['monthly_fee', 'monthly_base_fee', 'base_monthly_fee', 'monthly_subscription_fee', 'subscription_fee', 'monthly_price'],
};

/** Other names the agreement's text may use for the same list. */
export const LIST_ALIASES: Record<ListRole, string[]> = {
  categories: ['categories', 'approved_categories', 'permitted_categories', 'authorized_categories'],
  permitted_actions: ['permitted_actions', 'enumerated_actions', 'authorized_actions', 'allowed_actions'],
  restricted_actions: ['restricted_actions'],
  counterparties: ['permitted_counterparties', 'approved_counterparties', 'allowed_counterparties', 'counterparties'],
  milestones: ['milestones'],
};

/** Other names the agreement's text may use for the same count (a duration, a notice period). */
export const ANSWER_ALIASES: Record<string, string[]> = {
  duration_months: ['duration_months', 'term_months', 'duration', 'term'],
  term_months: ['term_months', 'duration_months', 'duration', 'term'],
  revocation_notice_hours: ['notice_period_hours', 'notice_hours'],
  sla_uptime_percent: ['uptime_percent', 'uptime'],
  sla_response_ms: ['response_time_ms', 'response_ms', 'latency_ms'],
  rate_limit_rpm: ['requests_per_minute', 'rpm', 'rate_limit', 'rate_limit_per_minute'],
  data_retention_days: ['retention_days'],
};
