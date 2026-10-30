-- P2 — Power of Attorney template (one-sided, no counterparty signature)
--
-- Adds the `is_one_sided` flag to templates + contracts and seeds the new
-- p2-power-of-attorney template at $0.50. Bilateral templates default to
-- false → existing draft → pending_signature → active flow unchanged.
--
-- When is_one_sided=true, the sign endpoint short-circuits the second
-- signature requirement: principal signs once, contract activates, single
-- cNFT mints to the principal wallet. Agent wallet is named in the contract
-- body for runtime / legal reference but does NOT sign.

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_one_sided boolean NOT NULL DEFAULT false;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS is_one_sided boolean NOT NULL DEFAULT false;

-- Optional partial index — most queries filter on bilateral (default) rows,
-- so a partial index on is_one_sided=true keeps writes cheap on the common
-- path while still letting the rare one-sided audit queries hit an index.
CREATE INDEX IF NOT EXISTS idx_templates_one_sided
  ON public.templates(is_one_sided) WHERE is_one_sided = true;

INSERT INTO public.templates (slug, name, description, category, parameter_schema, price_cents, is_one_sided)
VALUES (
  'p2-power-of-attorney',
  'Power of Attorney',
  'Unilateral grant of authority from a principal to their own AI agent. Principal signs once with their wallet; no counterparty signature required. A single cNFT mints to the principal wallet as on-chain proof of authority. Suitable for delegating an agent without round-trip handshake — informed by UPOAA (US) and EU agency-mandate law. Revocable per the contract''s revocation_clause.',
  'delegation',
  '{"type":"object","required":["principal_name","principal_type","principal_registration_number","principal_address","agent_id","agent_type","scope","duration_months","governing_law"],"properties":{"principal_name":{"type":"string","description":"Full legal name of the principal (the authorizer)"},"principal_type":{"type":"string","enum":["corporation","llc","individual","partnership","foundation"],"description":"Legal entity type of the principal"},"principal_registration_number":{"type":"string","description":"Company registration number, personal code, or EIN"},"principal_address":{"type":"string","description":"Registered address of the principal"},"principal_agent_id":{"type":"string","description":"Principal''s own wallet (auto-filled from connected wallet — signs the POA)"},"agent_id":{"type":"string","description":"AI agent wallet — receives authority but does NOT sign"},"agent_type":{"type":"string","enum":["autonomous","supervised","semi-autonomous"],"description":"Level of agent autonomy"},"scope":{"type":"string","description":"Natural language description of authorized actions"},"duration_months":{"type":"integer","description":"Term in months before automatic revocation"},"governing_law":{"type":"string","default":"Singapore","description":"Governing jurisdiction (Singapore, Delaware, England-Wales, Switzerland)"},"revocation_clause":{"type":"boolean","default":true,"description":"Principal may revoke unilaterally at any time"},"spending_limit_per_tx":{"type":"number","description":"Optional: maximum spend per single transaction in USD"},"spending_limit_monthly":{"type":"number","description":"Optional: maximum aggregate monthly spend in USD"},"requires_approval_above":{"type":"number","description":"Optional: transaction threshold requiring separate principal approval"}}}',
  20,
  true
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    parameter_schema = EXCLUDED.parameter_schema,
    price_cents = EXCLUDED.price_cents,
    is_one_sided = EXCLUDED.is_one_sided,
    is_active = true;
