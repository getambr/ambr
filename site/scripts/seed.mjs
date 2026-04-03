/**
 * One-time seed script — creates schema + inserts 6 templates into Supabase.
 * Run: node scripts/seed.mjs
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

// Parse .env.local
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2];
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function runSQL(sql, label) {
  console.log(`\n--- ${label} ---`);
  // Use Supabase pg-meta SQL endpoint
  const res = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'x-connection-encrypted': 'true',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`FAILED (${res.status}): ${text}`);
    return false;
  }

  const data = await res.json();
  console.log('OK:', JSON.stringify(data).slice(0, 200));
  return true;
}

// Schema SQL
const SCHEMA_SQL = `
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'templates' AND policyname = 'Public can read active templates') THEN
    CREATE POLICY "Public can read active templates" ON public.templates FOR SELECT USING (is_active = true);
  END IF;
END $$;

alter table public.templates enable row level security;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contracts' AND policyname = 'Public can read contracts') THEN
    CREATE POLICY "Public can read contracts" ON public.contracts FOR SELECT USING (true);
  END IF;
END $$;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  key_prefix text not null,
  email text not null,
  tier text not null default 'starter'
    check (tier in ('starter', 'builder', 'enterprise')),
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

create table if not exists public.waitlist_submissions (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text,
  message text,
  created_at timestamptz default now()
);

alter table public.waitlist_submissions enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist_submissions' AND policyname = 'Anyone can insert waitlist') THEN
    CREATE POLICY "Anyone can insert waitlist" ON public.waitlist_submissions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

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

const SEED_SQL = `
UPDATE public.templates SET is_active = false
  WHERE slug IN ('delegation', 'commerce', 'service-agreement', 'nda')
  AND slug NOT IN ('d1-general-auth', 'd2-limited-service', 'd3-fleet-auth', 'c1-api-access', 'c2-compute-sla', 'c3-task-execution');

INSERT INTO public.templates (slug, name, description, category, parameter_schema, price_cents, version) VALUES
('d1-general-auth', 'General Agent Authorization', 'Broad delegation of authority to an AI agent — defines action categories, spending caps, revocation terms, and principal liability. Compliant with UETA s. 14 (US) and eIDAS Art. 25 (EU).', 'delegation', '{"type":"object","required":["principal_name","principal_type","principal_registration_number","principal_address","agent_id","agent_type","scope","categories","spending_limit_per_tx","spending_limit_monthly","duration_months","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the delegating entity or individual"},"principal_type":{"type":"string","enum":["corporation","llc","individual","partnership","foundation"],"description":"Legal entity type of the principal"},"principal_registration_number":{"type":"string","description":"Company registration number, personal code, or EIN"},"principal_address":{"type":"string","description":"Registered address of the principal"},"agent_id":{"type":"string","description":"Agent wallet address (0x...) or platform identifier"},"agent_type":{"type":"string","enum":["autonomous","supervised","semi-autonomous"],"description":"Level of agent autonomy"},"scope":{"type":"string","description":"Natural language description of authorized actions"},"categories":{"type":"array","items":{"type":"string"},"description":"Approved action categories (e.g. procurement, data-queries, api-calls)"},"spending_limit_per_tx":{"type":"number","description":"Maximum spend per single transaction in USD"},"spending_limit_monthly":{"type":"number","description":"Maximum aggregate monthly spend in USD"},"duration_months":{"type":"integer","description":"Contract duration in months"},"governing_law":{"type":"string","default":"Singapore","description":"Governing jurisdiction (Singapore, Delaware, England-Wales, Switzerland)"},"requires_approval_above":{"type":"number","description":"Transaction threshold requiring separate principal approval"},"revocation_notice_hours":{"type":"integer","default":24,"description":"Hours of notice required for revocation"},"sub_delegation_allowed":{"type":"boolean","default":false,"description":"Whether agent may delegate to sub-agents"}}}'::jsonb, 200),
('d2-limited-service', 'Limited Service Agent', 'Time-bounded, task-specific delegation for a single service engagement. Fixed budget, narrow scope, automatic expiry. Suitable for one-off agent deployments.', 'delegation', '{"type":"object","required":["principal_name","principal_type","principal_registration_number","agent_id","service_description","budget_usd","start_date","end_date","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the delegating entity"},"principal_type":{"type":"string","enum":["corporation","llc","individual","partnership","foundation"]},"principal_registration_number":{"type":"string","description":"Company registration or personal identification number"},"agent_id":{"type":"string","description":"Agent wallet address or identifier"},"service_description":{"type":"string","description":"Specific service the agent is authorized to perform"},"budget_usd":{"type":"number","description":"Total fixed budget for the engagement in USD"},"start_date":{"type":"string","format":"date","description":"ISO 8601 date when authority begins"},"end_date":{"type":"string","format":"date","description":"ISO 8601 date when authority automatically expires"},"permitted_counterparties":{"type":"array","items":{"type":"string"},"description":"Specific entities the agent may transact with (empty = any)"},"reporting_frequency":{"type":"string","enum":["per-transaction","daily","weekly","on-completion"],"default":"per-transaction"},"governing_law":{"type":"string","default":"Singapore"},"early_termination_allowed":{"type":"boolean","default":true}}}'::jsonb, 150),
('d3-fleet-auth', 'Multi-Agent Fleet Authorization', 'Authorize a class of AI agents under a lead agent, with shared budget pool, escalation thresholds, and sub-delegation rules. For organizations running multiple coordinated agents.', 'delegation', '{"type":"object","required":["principal_name","principal_type","principal_registration_number","lead_agent_id","agent_class","max_fleet_size","shared_budget_monthly","escalation_threshold","duration_months","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the delegating entity"},"principal_type":{"type":"string","enum":["corporation","llc","partnership","foundation"]},"principal_registration_number":{"type":"string","description":"Company registration number"},"lead_agent_id":{"type":"string","description":"Wallet address of the lead/orchestrator agent"},"agent_class":{"type":"string","description":"Class identifier for authorized sub-agents (e.g. procurement-bot-v2)"},"max_fleet_size":{"type":"integer","description":"Maximum number of concurrent sub-agents"},"shared_budget_monthly":{"type":"number","description":"Total monthly budget shared across the fleet in USD"},"per_agent_tx_limit":{"type":"number","description":"Maximum single transaction for any individual agent"},"escalation_threshold":{"type":"number","description":"Transaction value above which lead agent must approve"},"permitted_actions":{"type":"array","items":{"type":"string"},"description":"Actions any fleet agent may perform"},"restricted_actions":{"type":"array","items":{"type":"string"},"description":"Actions reserved for lead agent only"},"duration_months":{"type":"integer","description":"Fleet authorization duration in months"},"governing_law":{"type":"string","default":"Singapore"},"audit_log_required":{"type":"boolean","default":true,"description":"Whether all sub-agent actions must be logged"}}}'::jsonb, 500),
('c1-api-access', 'API Access Agreement', 'Pay-per-call or subscription API access contract between an agent (buyer) and API provider (seller). Covers rate limits, SLA uptime, x402 payment terms, and data handling.', 'commerce', '{"type":"object","required":["buyer_name","buyer_agent_id","seller_name","api_endpoint","pricing_model","price_per_call","currency","sla_uptime_percent","governing_law"],"properties":{"buyer_name":{"type":"string","description":"Legal name of the API consumer / principal"},"buyer_agent_id":{"type":"string","description":"Wallet address of the agent consuming the API"},"seller_name":{"type":"string","description":"Legal name of the API provider"},"seller_agent_id":{"type":"string","description":"Wallet address of the provider agent (if agent-to-agent)"},"api_endpoint":{"type":"string","description":"Base URL or service identifier"},"pricing_model":{"type":"string","enum":["per-call","monthly-subscription","tiered","credits"],"description":"How usage is billed"},"price_per_call":{"type":"number","description":"Cost per API call in specified currency (for per-call model)"},"monthly_cap_usd":{"type":"number","description":"Maximum monthly spend"},"currency":{"type":"string","default":"USDC","description":"Payment currency (USDC, USD, EUR)"},"rate_limit_rpm":{"type":"integer","description":"Maximum requests per minute"},"sla_uptime_percent":{"type":"number","default":99.9,"description":"Guaranteed uptime percentage"},"sla_response_ms":{"type":"integer","description":"Maximum p95 response time in milliseconds"},"data_retention_days":{"type":"integer","default":30,"description":"How long request/response data is retained"},"data_processing_location":{"type":"string","description":"Geographic restriction on data processing (e.g. EU, US)"},"governing_law":{"type":"string","default":"Singapore"},"x402_enabled":{"type":"boolean","default":true,"description":"Whether x402 HTTP payment protocol is used"}}}'::jsonb, 300),
('c2-compute-sla', 'Compute & Data Processing SLA', 'Service-level agreement for ongoing compute, infrastructure, or data processing. Covers performance guarantees, auto-scaling, GDPR data handling, and breach remedies.', 'commerce', '{"type":"object","required":["client_name","client_agent_id","provider_name","service_description","resource_type","monthly_fee","sla_uptime_percent","term_months","governing_law"],"properties":{"client_name":{"type":"string","description":"Legal name of the client entity"},"client_agent_id":{"type":"string","description":"Wallet address of the client agent"},"provider_name":{"type":"string","description":"Legal name of the service provider"},"provider_agent_id":{"type":"string","description":"Wallet address of the provider agent"},"service_description":{"type":"string","description":"Detailed description of compute/data services provided"},"resource_type":{"type":"string","enum":["gpu-compute","cpu-compute","storage","data-processing","ml-inference","mixed"],"description":"Primary resource type"},"monthly_fee":{"type":"number","description":"Base monthly fee in specified currency"},"currency":{"type":"string","default":"USDC"},"sla_uptime_percent":{"type":"number","default":99.95,"description":"Guaranteed uptime percentage"},"sla_response_ms":{"type":"integer","description":"Maximum p95 latency in milliseconds"},"auto_scaling":{"type":"boolean","default":false,"description":"Whether auto-scaling is included"},"max_scaling_multiplier":{"type":"number","default":2,"description":"Maximum auto-scale factor (e.g. 2x = up to double base resources)"},"data_processing_location":{"type":"string","description":"GDPR: geographic restriction on data processing"},"data_deletion_on_termination":{"type":"boolean","default":true,"description":"Whether provider deletes all client data on contract end"},"breach_credit_percent":{"type":"number","default":10,"description":"Service credit percentage per SLA breach incident"},"term_months":{"type":"integer","description":"Contract duration in months"},"governing_law":{"type":"string","default":"Singapore"}}}'::jsonb, 400),
('c3-task-execution', 'Task Execution Agreement', 'Agent-to-agent or principal-to-agent task contract with defined deliverables, acceptance criteria, and payment on completion. For one-off or milestone-based work.', 'commerce', '{"type":"object","required":["requester_name","requester_agent_id","executor_name","executor_agent_id","task_description","deliverables","acceptance_criteria","total_price","currency","deadline","governing_law"],"properties":{"requester_name":{"type":"string","description":"Legal name of the requesting party / principal"},"requester_agent_id":{"type":"string","description":"Wallet address of the requester agent"},"executor_name":{"type":"string","description":"Legal name of the executing party / provider"},"executor_agent_id":{"type":"string","description":"Wallet address of the executor agent"},"task_description":{"type":"string","description":"Detailed description of the task to be performed"},"deliverables":{"type":"array","items":{"type":"string"},"description":"List of specific deliverables expected"},"acceptance_criteria":{"type":"string","description":"How completion and quality will be verified"},"total_price":{"type":"number","description":"Total payment for completed task"},"currency":{"type":"string","default":"USDC"},"payment_model":{"type":"string","enum":["on-completion","milestone","upfront","escrow"],"default":"on-completion","description":"When payment is released"},"milestones":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"amount":{"type":"number"},"deadline":{"type":"string","format":"date"}}},"description":"Milestone breakdown (if payment_model is milestone)"},"deadline":{"type":"string","format":"date","description":"ISO 8601 final deadline"},"revision_rounds":{"type":"integer","default":1,"description":"Number of revision rounds included"},"ip_ownership":{"type":"string","enum":["requester","executor","shared","work-for-hire"],"default":"requester","description":"Who owns intellectual property of the deliverables"},"confidentiality_required":{"type":"boolean","default":false},"governing_law":{"type":"string","default":"Singapore"}}}'::jsonb, 350)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  parameter_schema = EXCLUDED.parameter_schema,
  price_cents = EXCLUDED.price_cents;
`;

async function main() {
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Project ref: xoepsyapvuzijuyrvmbz');

  const schemaOk = await runSQL(SCHEMA_SQL, 'Schema');
  if (!schemaOk) {
    console.error('\nSchema failed. Aborting.');
    process.exit(1);
  }

  const seedOk = await runSQL(SEED_SQL, 'Seed Templates');
  if (!seedOk) {
    console.error('\nSeed failed.');
    process.exit(1);
  }

  // Verify
  const verifyOk = await runSQL('SELECT slug, name, category, price_cents FROM public.templates WHERE is_active = true ORDER BY slug;', 'Verify');
  if (!verifyOk) {
    console.error('\nVerify query failed.');
    process.exit(1);
  }

  console.log('\nDone! Templates seeded successfully.');
}

main();
