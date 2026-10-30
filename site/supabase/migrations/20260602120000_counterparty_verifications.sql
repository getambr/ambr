-- DACS-2 Vet — counterparty credential verification records.
-- One row per verify-party call (e.g. an LEI/GLEIF check via Demos DAHR).
-- Server-only: RLS enabled with NO policies, so only the service role (the
-- API routes via getSupabaseAdmin) can read/write — mirrors identity_nullifiers.

CREATE TABLE IF NOT EXISTS public.counterparty_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  party_role text NOT NULL,                 -- which party was checked (e.g. 'principal')
  scheme text NOT NULL,                      -- DACS-1 claim scheme (e.g. 'lei')
  identifier text NOT NULL,                  -- the canonical identifier verified
  decision text NOT NULL
    CHECK (decision IN ('pass', 'fail', 'indeterminate', 'error')),
  verify_result jsonb NOT NULL,              -- the full DACS VerifyResult
  dahr_tx_hash text,                         -- Demos web2Request tx (null while stubbed)
  verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpv_contract
  ON public.counterparty_verifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_cpv_scheme_identifier
  ON public.counterparty_verifications(scheme, identifier);

ALTER TABLE public.counterparty_verifications ENABLE ROW LEVEL SECURITY;
