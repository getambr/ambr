/**
 * Template seed data — run the SQL below in Supabase SQL Editor to create tables and seed templates.
 * This file is for reference; the actual seeding happens via SQL.
 */

export const SCHEMA_SQL = `
-- ============================================================
-- Ambr — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Templates
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null,
  category text not null,
  parameter_schema jsonb not null,
  price_cents int not null default 50,
  is_active boolean default true,
  version int default 1,
  created_at timestamptz default now()
);

alter table public.templates enable row level security;
create policy "Public can read active templates"
  on public.templates for select using (is_active = true);

-- 2. Contracts
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_id text unique not null,
  template_id uuid references public.templates(id),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'terminated', 'expired')),
  human_readable text not null,
  machine_readable jsonb not null,
  sha256_hash text unique not null,
  principal_declaration jsonb not null,
  parent_contract_hash text,
  amendment_type text default 'original'
    check (amendment_type in ('original', 'amendment', 'extension')),
  parameters jsonb,
  api_key_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_contracts_sha256 on public.contracts(sha256_hash);
create index if not exists idx_contracts_contract_id on public.contracts(contract_id);
create index if not exists idx_contracts_status on public.contracts(status);

alter table public.contracts enable row level security;
create policy "Public can read contracts"
  on public.contracts for select using (true);

-- 3. API Keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  key_prefix text not null,
  email text not null,
  tier text not null default 'developer'
    check (tier in ('alpha', 'developer', 'startup', 'scale', 'enterprise')),
  credits int not null default 50,
  tx_hash text unique,
  tx_from text,
  amount_usdc text,
  is_active boolean default true,
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create index if not exists idx_api_keys_hash on public.api_keys(key_hash);
create index if not exists idx_api_keys_email on public.api_keys(email);

alter table public.api_keys enable row level security;
-- No public access to api_keys

-- 4. Waitlist Submissions
create table if not exists public.waitlist_submissions (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text,
  message text,
  created_at timestamptz default now()
);

alter table public.waitlist_submissions enable row level security;
create policy "Anyone can insert waitlist"
  on public.waitlist_submissions for insert with check (true);

-- 5. Contract ID sequence
create sequence if not exists public.contract_id_seq start 1;

create or replace function public.next_contract_id()
returns text as $$
declare
  seq_val bigint;
begin
  seq_val := nextval('public.contract_id_seq');
  return 'amb-' || extract(year from now())::text || '-' || lpad(seq_val::text, 4, '0');
end;
$$ language plpgsql;
`;

export const SEED_TEMPLATES_SQL = `
-- ============================================================
-- Seed: 6 Ricardian Contract Templates (D1-D3, C1-C3)
-- Grounded in EU/LV, US/Delaware, UK, Singapore legal research
-- ============================================================

-- First deactivate old templates that are being replaced
UPDATE public.templates SET is_active = false
  WHERE slug IN ('delegation', 'commerce', 'service-agreement', 'nda')
  AND slug NOT IN ('d1-general-auth', 'd2-limited-service', 'd3-fleet-auth', 'c1-api-access', 'c2-compute-sla', 'c3-task-execution');

INSERT INTO public.templates (slug, name, description, category, parameter_schema, price_cents, version) VALUES
-- ─────────────────────────────────────────────
-- D1: General Agent Authorization
-- ─────────────────────────────────────────────
(
  'd1-general-auth',
  'General Agent Authorization',
  'Broad delegation of authority to an AI agent — defines action categories, spending caps, revocation terms, and principal liability. Compliant with UETA s. 14 (US) and eIDAS Art. 25 (EU).',
  'delegation',
  '{"type":"object","required":["principal_name","principal_type","principal_registration_number","principal_address","agent_id","agent_type","scope","categories","spending_limit_per_tx","spending_limit_monthly","duration_months","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the delegating entity or individual"},"principal_type":{"type":"string","enum":["corporation","llc","individual","partnership","foundation"],"description":"Legal entity type of the principal"},"principal_registration_number":{"type":"string","description":"Company registration number, personal code, or EIN"},"principal_address":{"type":"string","description":"Registered address of the principal"},"agent_id":{"type":"string","description":"Agent wallet address (0x...) or platform identifier"},"agent_type":{"type":"string","enum":["autonomous","supervised","semi-autonomous"],"description":"Level of agent autonomy"},"scope":{"type":"string","description":"Natural language description of authorized actions"},"categories":{"type":"array","items":{"type":"string"},"description":"Approved action categories (e.g. procurement, data-queries, api-calls)"},"spending_limit_per_tx":{"type":"number","description":"Maximum spend per single transaction in USD"},"spending_limit_monthly":{"type":"number","description":"Maximum aggregate monthly spend in USD"},"duration_months":{"type":"integer","description":"Contract duration in months"},"governing_law":{"type":"string","default":"Singapore","description":"Governing jurisdiction (Singapore, Delaware, England-Wales, Switzerland)"},"requires_approval_above":{"type":"number","description":"Transaction threshold requiring separate principal approval"},"revocation_notice_hours":{"type":"integer","default":24,"description":"Hours of notice required for revocation"},"sub_delegation_allowed":{"type":"boolean","default":false,"description":"Whether agent may delegate to sub-agents"}}}',
  200
),
-- ─────────────────────────────────────────────
-- D2: Limited Service Agent
-- ─────────────────────────────────────────────
(
  'd2-limited-service',
  'Limited Service Agent',
  'Time-bounded, task-specific delegation for a single service engagement. Fixed budget, narrow scope, automatic expiry. Suitable for one-off agent deployments.',
  'delegation',
  '{"type":"object","required":["principal_name","principal_type","principal_registration_number","agent_id","service_description","budget_usd","start_date","end_date","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the delegating entity"},"principal_type":{"type":"string","enum":["corporation","llc","individual","partnership","foundation"]},"principal_registration_number":{"type":"string","description":"Company registration or personal identification number"},"agent_id":{"type":"string","description":"Agent wallet address or identifier"},"service_description":{"type":"string","description":"Specific service the agent is authorized to perform"},"budget_usd":{"type":"number","description":"Total fixed budget for the engagement in USD"},"start_date":{"type":"string","format":"date","description":"ISO 8601 date when authority begins"},"end_date":{"type":"string","format":"date","description":"ISO 8601 date when authority automatically expires"},"permitted_counterparties":{"type":"array","items":{"type":"string"},"description":"Specific entities the agent may transact with (empty = any)"},"reporting_frequency":{"type":"string","enum":["per-transaction","daily","weekly","on-completion"],"default":"per-transaction"},"governing_law":{"type":"string","default":"Singapore"},"early_termination_allowed":{"type":"boolean","default":true}}}',
  150
),
-- ─────────────────────────────────────────────
-- D3: Multi-Agent Fleet Authorization
-- ─────────────────────────────────────────────
(
  'd3-fleet-auth',
  'Multi-Agent Fleet Authorization',
  'Authorize a class of AI agents under a lead agent, with shared budget pool, escalation thresholds, and sub-delegation rules. For organizations running multiple coordinated agents.',
  'delegation',
  '{"type":"object","required":["principal_name","principal_type","principal_registration_number","lead_agent_id","agent_class","max_fleet_size","shared_budget_monthly","escalation_threshold","duration_months","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the delegating entity"},"principal_type":{"type":"string","enum":["corporation","llc","partnership","foundation"]},"principal_registration_number":{"type":"string","description":"Company registration number"},"lead_agent_id":{"type":"string","description":"Wallet address of the lead/orchestrator agent"},"agent_class":{"type":"string","description":"Class identifier for authorized sub-agents (e.g. procurement-bot-v2)"},"max_fleet_size":{"type":"integer","description":"Maximum number of concurrent sub-agents"},"shared_budget_monthly":{"type":"number","description":"Total monthly budget shared across the fleet in USD"},"per_agent_tx_limit":{"type":"number","description":"Maximum single transaction for any individual agent"},"escalation_threshold":{"type":"number","description":"Transaction value above which lead agent must approve"},"permitted_actions":{"type":"array","items":{"type":"string"},"description":"Actions any fleet agent may perform"},"restricted_actions":{"type":"array","items":{"type":"string"},"description":"Actions reserved for lead agent only"},"duration_months":{"type":"integer","description":"Fleet authorization duration in months"},"governing_law":{"type":"string","default":"Singapore"},"audit_log_required":{"type":"boolean","default":true,"description":"Whether all sub-agent actions must be logged"}}}',
  500
),
-- ─────────────────────────────────────────────
-- C1: API Access Agreement
-- ─────────────────────────────────────────────
(
  'c1-api-access',
  'API Access Agreement',
  'Pay-per-call or subscription API access contract between an agent (buyer) and API provider (seller). Covers rate limits, SLA uptime, x402 payment terms, and data handling.',
  'commerce',
  '{"type":"object","required":["buyer_name","buyer_agent_id","seller_name","api_endpoint","pricing_model","price_per_call","currency","sla_uptime_percent","governing_law"],"properties":{"buyer_name":{"type":"string","description":"Legal name of the API consumer / principal"},"buyer_agent_id":{"type":"string","description":"Wallet address of the agent consuming the API"},"seller_name":{"type":"string","description":"Legal name of the API provider"},"seller_agent_id":{"type":"string","description":"Wallet address of the provider agent (if agent-to-agent)"},"api_endpoint":{"type":"string","description":"Base URL or service identifier"},"pricing_model":{"type":"string","enum":["per-call","monthly-subscription","tiered","credits"],"description":"How usage is billed"},"price_per_call":{"type":"number","description":"Cost per API call in specified currency (for per-call model)"},"monthly_cap_usd":{"type":"number","description":"Maximum monthly spend"},"currency":{"type":"string","default":"USDC","description":"Payment currency (USDC, USD, EUR)"},"rate_limit_rpm":{"type":"integer","description":"Maximum requests per minute"},"sla_uptime_percent":{"type":"number","default":99.9,"description":"Guaranteed uptime percentage"},"sla_response_ms":{"type":"integer","description":"Maximum p95 response time in milliseconds"},"data_retention_days":{"type":"integer","default":30,"description":"How long request/response data is retained"},"data_processing_location":{"type":"string","description":"Geographic restriction on data processing (e.g. EU, US)"},"governing_law":{"type":"string","default":"Singapore"},"x402_enabled":{"type":"boolean","default":true,"description":"Whether x402 HTTP payment protocol is used"}}}',
  300
),
-- ─────────────────────────────────────────────
-- C2: Compute / Data Processing SLA
-- ─────────────────────────────────────────────
(
  'c2-compute-sla',
  'Compute & Data Processing SLA',
  'Service-level agreement for ongoing compute, infrastructure, or data processing. Covers performance guarantees, auto-scaling, GDPR data handling, and breach remedies.',
  'commerce',
  '{"type":"object","required":["client_name","client_agent_id","provider_name","service_description","resource_type","monthly_fee","sla_uptime_percent","term_months","governing_law"],"properties":{"client_name":{"type":"string","description":"Legal name of the client entity"},"client_agent_id":{"type":"string","description":"Wallet address of the client agent"},"provider_name":{"type":"string","description":"Legal name of the service provider"},"provider_agent_id":{"type":"string","description":"Wallet address of the provider agent"},"service_description":{"type":"string","description":"Detailed description of compute/data services provided"},"resource_type":{"type":"string","enum":["gpu-compute","cpu-compute","storage","data-processing","ml-inference","mixed"],"description":"Primary resource type"},"monthly_fee":{"type":"number","description":"Base monthly fee in specified currency"},"currency":{"type":"string","default":"USDC"},"sla_uptime_percent":{"type":"number","default":99.95,"description":"Guaranteed uptime percentage"},"sla_response_ms":{"type":"integer","description":"Maximum p95 latency in milliseconds"},"auto_scaling":{"type":"boolean","default":false,"description":"Whether auto-scaling is included"},"max_scaling_multiplier":{"type":"number","default":2,"description":"Maximum auto-scale factor (e.g. 2x = up to double base resources)"},"data_processing_location":{"type":"string","description":"GDPR: geographic restriction on data processing"},"data_deletion_on_termination":{"type":"boolean","default":true,"description":"Whether provider deletes all client data on contract end"},"breach_credit_percent":{"type":"number","default":10,"description":"Service credit percentage per SLA breach incident"},"term_months":{"type":"integer","description":"Contract duration in months"},"governing_law":{"type":"string","default":"Singapore"}}}',
  400
),
-- ─────────────────────────────────────────────
-- C3: Task Execution Agreement
-- ─────────────────────────────────────────────
(
  'c3-task-execution',
  'Task Execution Agreement',
  'Agent-to-agent or principal-to-agent task contract with defined deliverables, acceptance criteria, and payment on completion. For one-off or milestone-based work.',
  'commerce',
  '{"type":"object","required":["requester_name","requester_agent_id","executor_name","executor_agent_id","task_description","deliverables","acceptance_criteria","total_price","currency","deadline","governing_law"],"properties":{"requester_name":{"type":"string","description":"Legal name of the requesting party / principal"},"requester_agent_id":{"type":"string","description":"Wallet address of the requester agent"},"executor_name":{"type":"string","description":"Legal name of the executing party / provider"},"executor_agent_id":{"type":"string","description":"Wallet address of the executor agent"},"task_description":{"type":"string","description":"Detailed description of the task to be performed"},"deliverables":{"type":"array","items":{"type":"string"},"description":"List of specific deliverables expected"},"acceptance_criteria":{"type":"string","description":"How completion and quality will be verified"},"total_price":{"type":"number","description":"Total payment for completed task"},"currency":{"type":"string","default":"USDC"},"payment_model":{"type":"string","enum":["on-completion","milestone","upfront","escrow"],"default":"on-completion","description":"When payment is released"},"milestones":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"amount":{"type":"number"},"deadline":{"type":"string","format":"date"}}},"description":"Milestone breakdown (if payment_model is milestone)"},"deadline":{"type":"string","format":"date","description":"ISO 8601 final deadline"},"revision_rounds":{"type":"integer","default":1,"description":"Number of revision rounds included"},"ip_ownership":{"type":"string","enum":["requester","executor","shared","work-for-hire"],"default":"requester","description":"Who owns intellectual property of the deliverables"},"confidentiality_required":{"type":"boolean","default":false},"governing_law":{"type":"string","default":"Singapore"}}}',
  350
),
-- ─────────────────────────────────────────────
-- A1: Service Purchase Agreement (Agent-to-Consumer)
-- ─────────────────────────────────────────────
(
  'a1-service-purchase',
  'Service Purchase Agreement (Agent-to-Consumer)',
  'An AI agent sells a defined service to a human consumer — covers scope, fees, delivery timeline, refund policy, and mandatory cooling-off period. Compliant with EU Consumer Rights Directive 2011/83/EU, UETA s. 14, and eIDAS Art. 25. Includes EU AI Act Art. 50 transparency disclosure.',
  'consumer',
  '{"type":"object","required":["consumer_name","consumer_email","provider_name","provider_agent_id","service_description","fee","currency","delivery_timeline","refund_policy","governing_law"],"properties":{"consumer_name":{"type":"string","description":"Full legal name of the consumer purchasing the service"},"consumer_email":{"type":"string","format":"email","description":"Consumer email address (used for signing via Privy/magic-link, NOT wallet)"},"provider_name":{"type":"string","description":"Legal name of the entity behind the AI agent"},"provider_agent_id":{"type":"string","description":"Agent wallet address (0x...) or platform identifier of the selling agent"},"service_description":{"type":"string","description":"Clear, plain-language description of the service being purchased"},"fee":{"type":"number","description":"Total fee for the service in the specified currency"},"currency":{"type":"string","enum":["USD","EUR","GBP","SGD","USDC"],"default":"USD","description":"Currency for the fee"},"delivery_timeline":{"type":"string","description":"When and how the service will be delivered (e.g., within 24 hours, by 2026-05-01)"},"refund_policy":{"type":"string","description":"Clear refund terms — must be prominently stated per Consumer Rights Directive"},"cooling_off_days":{"type":"integer","default":14,"minimum":14,"description":"Cooling-off period in days (EU minimum 14 per Directive 2011/83/EU Art. 9)"},"governing_law":{"type":"string","default":"Singapore","enum":["Singapore","Delaware","England-Wales","Switzerland","EU-Consumer"],"description":"Governing jurisdiction. For EU consumers, EU-Consumer applies consumer local law."},"data_processing_notice":{"type":"string","description":"GDPR Art. 13-14 information notice about how consumer data is processed"},"agent_disclosure":{"type":"string","default":"This contract is generated and administered by an AI agent.","description":"EU AI Act Art. 50 transparency disclosure — must be included in contract text"}}}',
  30
),
-- ─────────────────────────────────────────────
-- A2: AI-Driven Subscription Agreement
-- ─────────────────────────────────────────────
(
  'a2-ai-subscription',
  'AI-Driven Subscription Agreement',
  'Consumer subscribes to an AI-mediated service with recurring billing — covers monthly fee, SLA, cancellation, auto-renewal controls, and mandatory cooling-off. Compliant with EU Consumer Rights Directive, UETA s. 14, eIDAS Art. 25. No auto-renewal without explicit opt-in per EU directive.',
  'consumer',
  '{"type":"object","required":["consumer_name","consumer_email","provider_name","provider_agent_id","subscription_description","monthly_fee","currency","billing_cycle","cancellation_notice_days","governing_law"],"properties":{"consumer_name":{"type":"string","description":"Full legal name of the subscribing consumer"},"consumer_email":{"type":"string","format":"email","description":"Consumer email address for signing and billing notifications"},"provider_name":{"type":"string","description":"Legal name of the entity behind the AI agent"},"provider_agent_id":{"type":"string","description":"Agent wallet address (0x...) or platform identifier"},"subscription_description":{"type":"string","description":"Clear description of what the subscription includes"},"monthly_fee":{"type":"number","description":"Monthly subscription fee"},"currency":{"type":"string","enum":["USD","EUR","GBP","SGD","USDC"],"default":"USD"},"billing_cycle":{"type":"string","enum":["monthly","quarterly","annual"],"default":"monthly","description":"How often the consumer is billed"},"sla_description":{"type":"string","description":"Service Level Agreement — uptime, response time, support availability"},"cancellation_notice_days":{"type":"integer","default":30,"description":"Days of notice required for cancellation"},"cooling_off_days":{"type":"integer","default":14,"minimum":14,"description":"Cooling-off period per EU Consumer Rights Directive"},"auto_renew":{"type":"boolean","default":false,"description":"Auto-renewal MUST be opt-in (default false). EU consumers must explicitly consent."},"prorated_refund":{"type":"boolean","default":true,"description":"Whether unused portion is refunded on cancellation"},"governing_law":{"type":"string","default":"Singapore","enum":["Singapore","Delaware","England-Wales","Switzerland","EU-Consumer"]}}}',
  30
),
-- ─────────────────────────────────────────────
-- A3: AI Agent Warranty and Liability Agreement
-- ─────────────────────────────────────────────
(
  'a3-warranty-liability',
  'AI Agent Warranty and Liability Agreement',
  'AI agent commits to a guaranteed service outcome with enforceable liability caps and remedies. Covers warranty scope, liability limits, claim procedures, and arbitration. Consumer may reject arbitration in favor of small claims court. UCTA-compliant: no exclusion of liability for negligence or death.',
  'consumer',
  '{"type":"object","required":["consumer_name","consumer_email","provider_name","provider_agent_id","warranty_description","guaranteed_outcome","liability_cap_usd","remedy_description","claim_deadline_days","governing_law"],"properties":{"consumer_name":{"type":"string","description":"Full legal name of the consumer"},"consumer_email":{"type":"string","format":"email","description":"Consumer email for signing and claim notifications"},"provider_name":{"type":"string","description":"Legal name of the entity behind the AI agent"},"provider_agent_id":{"type":"string","description":"Agent wallet address (0x...)"},"warranty_description":{"type":"string","description":"What is warranted — clear, specific, measurable"},"guaranteed_outcome":{"type":"string","description":"The specific outcome the agent guarantees (must be objectively verifiable)"},"liability_cap_usd":{"type":"number","description":"Maximum liability in USD. UCTA s. 11: must be reasonable (minimum 2x contract value for consumer contracts)"},"remedy_description":{"type":"string","description":"What happens if the guarantee is not met (refund, credit, re-performance, etc.)"},"claim_deadline_days":{"type":"integer","default":90,"description":"Days after service delivery within which consumer must file a warranty claim"},"arbitration_provider":{"type":"string","default":"IETF ADP v1","description":"Arbitration body for disputes. Consumer retains right to reject in favor of small claims court."},"cooling_off_days":{"type":"integer","default":14,"minimum":14,"description":"Cooling-off period per EU Consumer Rights Directive"},"governing_law":{"type":"string","default":"Singapore","enum":["Singapore","Delaware","England-Wales","Switzerland","EU-Consumer"]}}}',
  30
)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  parameter_schema = EXCLUDED.parameter_schema,
  price_cents = EXCLUDED.price_cents;
`;
