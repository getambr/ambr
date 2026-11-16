import { checkTransaction, termsFromAgreement, type CheckOutcome, type CheckTransaction } from '../check-terms';

/**
 * One realistic agreement per template the payment check reads: the form
 * answers and a machine_readable of the shape the contract generator writes
 * (see BASE_INSTRUCTIONS in llm/prompts.ts and generate-contract.ts): the contract id,
 * version and creation time, the principal declaration, the electronic formation recital
 * with its statute citations, the dual-format reconciliation block, notice periods written
 * as text, "None" for what the agreement leaves out, amounts with two decimals, and the
 * compliance block. `tx` is a payment that fits it, with everything the agreement limits sent.
 */
export interface Golden {
  slug: string;
  parameters: Record<string, unknown>;
  machineReadable: Record<string, unknown>;
  tx: CheckTransaction;
  createdAt: string;
}

export const NOW = new Date('2026-06-15T12:00:00Z');
export const CREATED = '2026-06-01T00:00:00Z';
const AGENT = `0x${'a'.repeat(40)}`;
const WALLET = `0x${'b'.repeat(40)}`;

const compliance = {
  human_oversight_method: 'pre-authorized delegation',
  oversight_framework: 'eu_ai_act_article_14',
  delegation_chain_auditable: true,
  revocation_capable: true,
};

const principal = {
  name: 'Acme Corp',
  type: 'corporation',
  registration_number: 'REG-000000',
  address: '1 Example Street, Example City',
};

/** What the generator prompt requires in every machine_readable, whatever the template. */
const mandatory = (n: number, slug: string) => ({
  contract_id: `amber-2026-000${n}`,
  version: '1.0',
  created_at: CREATED,
  template: slug,
  schema_version: '1.0.0',
  principal_declaration: {
    principal_name: 'Acme Corp',
    entity_type: 'corporation',
    registration_number: 'REG-000000',
    address: '1 Example Street, Example City',
    statement: "The Principal authorizes the Agent's signatures on its behalf within the scope of this agreement.",
  },
  electronic_formation_recital:
    'This contract is formed pursuant to the Electronic Transactions Act (Cap. 88), Section 15. The parties acknowledge that contracts formed through electronic agents are valid and enforceable.',
  dual_format_reconciliation: {
    primacy: 'human-readable',
    reconciliation_method: 'sha256-hash-binding',
    dispute_protocol: 'ietf-adp-v1',
  },
  dispute_resolution: { primary: 'ietf-adp-v1', fallback: 'the courts of the governing jurisdiction' },
  primacy_clause: 'In the event of any inconsistency between the human-readable text and the machine-parsable JSON, the human-readable text shall prevail.',
  hash_placeholder: '[HASH_PLACEHOLDER — computed after generation]',
  compliance,
});

export function goldens(): Record<string, Golden> {
  return {
    'd1-general-auth': {
      slug: 'd1-general-auth',
      createdAt: CREATED,
      parameters: {
        principal_name: 'Acme Corp',
        principal_type: 'corporation',
        principal_registration_number: 'REG-000000',
        principal_address: '1 Example Street, Example City',
        principal_agent_id: WALLET,
        agent_id: AGENT,
        agent_type: 'supervised',
        scope: 'Buy office supplies and cloud services',
        categories: ['procurement', 'cloud'],
        spending_limit_per_tx: 100,
        spending_limit_monthly: 1000,
        requires_approval_above: 50,
        duration_months: 12,
        governing_law: 'Singapore',
        revocation_notice_hours: 24,
        sub_delegation_allowed: false,
      },
      machineReadable: {
        ...mandatory(1, 'd1-general-auth'),
        principal,
        agent_identification: { agent_id: AGENT, agent_type: 'supervised', platform_reference: 'example-platform' },
        scope_of_delegation: {
          purpose: 'Buy office supplies and cloud services',
          enumerated_actions: ['pay_invoice', 'purchase_compute'],
          approved_categories: ['procurement', 'cloud'],
          boundaries: ['The Agent may not enter long-term leases.'],
          excluded_vendors: [],
          geographic_limitations: 'None',
        },
        financial_terms: {
          currency: 'USD',
          spending_limit_per_tx: '100.00',
          spending_limit_monthly: '1000.00',
          requires_approval_above: '50.00',
          payment_timing: 'As invoiced',
        },
        duration: { duration_months: 12, start_date: 'Date of signature', renewal: 'None' },
        sub_delegation: { allowed: false },
        revocation: { notice_period_hours: 24, notice_period: '24 hours written notice' },
        governing_law: 'Singapore',
      },
      tx: { amount: 40, currency: 'USD', category: 'procurement', action: 'pay_invoice', period_spent: 200 },
    },

    'p2-power-of-attorney': {
      slug: 'p2-power-of-attorney',
      createdAt: CREATED,
      parameters: {
        principal_name: 'Acme Corp',
        principal_type: 'corporation',
        principal_registration_number: 'REG-000000',
        principal_address: '1 Example Street, Example City',
        agent_id: AGENT,
        agent_type: 'autonomous',
        scope: 'Run day to day purchasing',
        duration_months: 6,
        governing_law: 'Delaware',
        revocation_clause: true,
        spending_limit_per_tx: 100,
        spending_limit_monthly: 1000,
        requires_approval_above: 50,
      },
      machineReadable: {
        ...mandatory(2, 'p2-power-of-attorney'),
        electronic_formation_recital:
          'This contract is formed pursuant to the Uniform Electronic Transactions Act (UETA) Section 14 and the Electronic Signatures in Global and National Commerce Act (ESIGN). The parties acknowledge that electronic agents may form binding contracts.',
        principal,
        agent_identification: { agent_id: AGENT, agent_type: 'autonomous' },
        scope_of_authority: {
          purpose: 'Run day to day purchasing',
          permitted_actions: ['pay_invoice'],
          boundaries: ['None'],
        },
        financial_terms: {
          currency: 'USD',
          spending_limit_per_tx: '100.00',
          spending_limit_monthly: '1000.00',
          requires_approval_above: '50.00',
        },
        duration: { duration_months: 6 },
        revocation: { revocable: true, notice: 'Immediate on written notice' },
        governing_law: 'Delaware',
      },
      tx: { amount: 40, currency: 'USDC', action: 'pay_invoice', period_spent: 200 },
    },

    'd2-limited-service': {
      slug: 'd2-limited-service',
      createdAt: CREATED,
      parameters: {
        principal_name: 'Acme Corp',
        principal_type: 'llc',
        principal_registration_number: 'REG-000000',
        agent_id: AGENT,
        service_description: 'Migrate the reporting database',
        budget_usd: 5000,
        start_date: '2026-06-01',
        end_date: '2026-12-31',
        permitted_counterparties: [],
        reporting_frequency: 'weekly',
        governing_law: 'England-Wales',
        early_termination_allowed: true,
      },
      machineReadable: {
        ...mandatory(3, 'd2-limited-service'),
        electronic_formation_recital:
          'This contract is formed under English common law principles of agency. Electronic signatures are admissible in evidence pursuant to the Electronic Communications Act 2000, Section 7.',
        principal: { name: 'Acme Corp', type: 'llc', registration_number: 'REG-000000' },
        agent_identification: { agent_id: AGENT },
        scope: { service_description: 'Migrate the reporting database', exclusions: 'None' },
        financial_terms: { currency: 'USD', budget_usd: '5000.00' },
        duration: { start_date: '2026-06-01', end_date: '2026-12-31' },
        reporting: { frequency: 'weekly' },
        early_termination: { allowed: true, notice: '14 days written notice' },
        permitted_counterparties: [],
        governing_law: 'England-Wales',
      },
      tx: { amount: 400, currency: 'USD', period_spent: 1000 },
    },

    'd3-fleet-auth': {
      slug: 'd3-fleet-auth',
      createdAt: CREATED,
      parameters: {
        principal_name: 'Acme Corp',
        principal_type: 'corporation',
        principal_registration_number: 'REG-000000',
        lead_agent_id: AGENT,
        agent_class: 'procurement-bot-v2',
        max_fleet_size: 5,
        shared_budget_monthly: 10000,
        per_agent_tx_limit: 500,
        escalation_threshold: 300,
        permitted_actions: ['purchase_compute', 'pay_invoice'],
        restricted_actions: ['change_limits'],
        duration_months: 12,
        governing_law: 'Switzerland',
        audit_log_required: true,
      },
      machineReadable: {
        ...mandatory(4, 'd3-fleet-auth'),
        principal: { name: 'Acme Corp', type: 'corporation', registration_number: 'REG-000000' },
        fleet: { lead_agent_id: AGENT, agent_class: 'procurement-bot-v2', max_fleet_size: 5 },
        scope_of_delegation: {
          enumerated_actions: ['purchase_compute', 'pay_invoice'],
          restricted_actions: ['change_limits'],
          geographic_limitations: 'None',
        },
        financial_terms: {
          currency: 'USD',
          shared_budget_monthly: '10000.00',
          per_agent_tx_limit: '500.00',
          escalation_threshold: '300.00',
        },
        duration: { duration_months: 12 },
        audit: { log_required: true },
        sub_agent_liability: 'The Principal is liable for all fleet agent actions within scope.',
        governing_law: 'Switzerland',
      },
      tx: { amount: 200, currency: 'USD', action: 'purchase_compute', period_spent: 1000 },
    },

    'c1-api-access': {
      slug: 'c1-api-access',
      createdAt: CREATED,
      parameters: {
        buyer_name: 'Acme Corp',
        buyer_agent_id: AGENT,
        seller_name: 'Data Co',
        api_endpoint: 'https://api.example.com/v2',
        pricing_model: 'per-call',
        price_per_call: 0.01,
        monthly_cap_usd: 500,
        currency: 'USDC',
        rate_limit_rpm: 60,
        sla_uptime_percent: 99.9,
        sla_response_ms: 800,
        data_retention_days: 30,
        governing_law: 'Singapore',
        x402_enabled: true,
      },
      machineReadable: {
        ...mandatory(5, 'c1-api-access'),
        parties: { buyer: 'Acme Corp', seller: 'Data Co' },
        api: { endpoint: 'https://api.example.com/v2', pricing_model: 'per-call', rate_limit_rpm: 60 },
        financial_terms: {
          currency: 'USDC',
          price_per_call: '0.01',
          monthly_cap_usd: '500.00',
          payment_timing: 'Per call, settled on receipt',
          x402_enabled: true,
        },
        sla: { sla_uptime_percent: 99.9, sla_response_ms: 800, uptime_commitment: '99.9% monthly uptime' },
        data_handling: { data_retention_days: 30, retention_notice: '30 days after termination' },
        governing_law: 'Singapore',
      },
      tx: { amount: 0.05, currency: 'USDC', period_spent: 100 },
    },

    'c2-compute-sla': {
      slug: 'c2-compute-sla',
      createdAt: CREATED,
      parameters: {
        client_name: 'Acme Corp',
        client_agent_id: AGENT,
        provider_name: 'Cloud Co',
        service_description: 'Managed inference cluster',
        resource_type: 'gpu-compute',
        monthly_fee: 2000,
        currency: 'USDC',
        sla_uptime_percent: 99.95,
        sla_response_ms: 400,
        auto_scaling: false,
        data_deletion_on_termination: true,
        breach_credit_percent: 10,
        term_months: 12,
        governing_law: 'Singapore',
      },
      machineReadable: {
        ...mandatory(6, 'c2-compute-sla'),
        parties: { client: 'Acme Corp', provider: 'Cloud Co' },
        service: { service_description: 'Managed inference cluster', resource_type: 'gpu-compute' },
        financial_terms: { currency: 'USDC', monthly_fee: '2000.00' },
        sla: { sla_uptime_percent: 99.95, sla_response_ms: 400, breach_credit_percent: 10 },
        term: { term_months: 12, termination_notice: '30 days written notice' },
        governing_law: 'Singapore',
      },
      tx: { amount: 500, currency: 'USDC', period_spent: 1000 },
    },

    'c3-task-execution': {
      slug: 'c3-task-execution',
      createdAt: CREATED,
      parameters: {
        requester_name: 'Acme Corp',
        requester_agent_id: AGENT,
        executor_name: 'Worker Ltd',
        executor_agent_id: WALLET,
        task_description: 'Label the product images',
        deliverables: ['Labelled images', 'Quality report'],
        acceptance_criteria: 'Reviewed and approved by the requester',
        total_price: 800,
        currency: 'USDC',
        payment_model: 'on-completion',
        deadline: '2026-09-01',
        revision_rounds: 2,
        ip_ownership: 'requester',
        confidentiality_required: false,
        governing_law: 'Singapore',
      },
      machineReadable: {
        ...mandatory(7, 'c3-task-execution'),
        parties: { requester: 'Acme Corp', executor: 'Worker Ltd' },
        task: { description: 'Label the product images', deliverables: ['Labelled images', 'Quality report'] },
        acceptance: { acceptance_criteria: 'Reviewed and approved by the requester' },
        financial_terms: { currency: 'USDC', total_price: '800.00', payment_model: 'on-completion', milestones: [] },
        deadline: '2026-09-01',
        revision_rounds: 2,
        governing_law: 'Singapore',
      },
      tx: { amount: 800, currency: 'USDC', period_spent: 0 },
    },
  };
}

type Json = Record<string, unknown>;

/** Run a golden through the whole path after editing a copy of its answers, its text or its payment. */
export function runGolden(
  g: Golden,
  edit: { parameters?: (p: Json) => void; mr?: (m: Json) => void; tx?: Partial<CheckTransaction>; createdAt?: string; now?: Date; oversightThresholdUsd?: number | string | null } = {},
  status = 'active',
): CheckOutcome {
  const parameters = structuredClone(g.parameters);
  const machineReadable = structuredClone(g.machineReadable);
  edit.parameters?.(parameters);
  edit.mr?.(machineReadable);
  const terms = termsFromAgreement({ templateSlug: g.slug, parameters, machineReadable, createdAt: edit.createdAt ?? g.createdAt, oversightThresholdUsd: edit.oversightThresholdUsd });
  return checkTransaction(terms, status, { ...g.tx, ...edit.tx }, edit.now ?? NOW);
}
