-- Email-verified key claim + recovery.
--
-- Why: a developer key was issued immediately and shown exactly once. It is
-- SHA-256'd at rest (api_keys.key_hash), so a user who missed it was locked
-- out of that email forever — the duplicate check in /api/v1/keys returned 409
-- and did not filter is_active, so even admin/freeze could not release it. The
-- only remedy was an operator deleting the row by hand. Separately,
-- /api/v1/pricing and the A2A agent card both advertised
-- `requires: ['verified_email']`, which nothing implemented and which
-- api_keys had no column capable of representing.
--
-- This table backs a single-use link that both verifies the mailbox and
-- delivers the key, and doubles as the recovery path (rotation).
--
-- Server-only: RLS enabled with NO policies, so only the service role (the
-- keys routes via getSupabaseAdmin) can read/write — mirrors
-- counterparty_verifications and email_events. Holds email addresses.

CREATE TABLE IF NOT EXISTS public.key_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,                       -- always stored lowercase
  token_hash text NOT NULL,                  -- SHA-256; the raw token only ever exists in the email
  purpose text NOT NULL
    CHECK (purpose IN ('claim', 'rotate')),  -- 'rotate' when the email already had an active key
  ip_address text,                           -- requester, for abuse triage
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz                    -- set atomically; a second use finds it non-null
);

-- Single-use enforcement depends on this being unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_key_claim_tokens_token_hash
  ON public.key_claim_tokens(token_hash);

-- Per-email request throttling reads this.
CREATE INDEX IF NOT EXISTS idx_key_claim_tokens_email_created
  ON public.key_claim_tokens(email, created_at DESC);

ALTER TABLE public.key_claim_tokens ENABLE ROW LEVEL SECURITY;
-- No policies created → service-role-only access, anon key blocked.

COMMENT ON TABLE public.key_claim_tokens IS 'Single-use email-verification tokens for claiming or rotating a free developer key. Raw token is never stored — only its SHA-256.';


-- --- api_keys hardening -----------------------------------------------------
-- The duplicate check used .eq('email', email), which is case-sensitive, and
-- no unique constraint existed. 'User@x.com' and 'user@x.com' were therefore
-- two separate free keys. Normalise first (verified collision-free before
-- writing this migration), then enforce it.
UPDATE public.api_keys SET email = lower(email) WHERE email <> lower(email);

-- One ACTIVE free key per email address.
-- The `is_active` predicate is load-bearing: rotation deactivates the old
-- row and inserts a new one with the same email, so an index that counted
-- deactivated rows would block the very recovery path this migration adds.
-- Paid tiers are deliberately excluded — they may legitimately hold several.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_one_active_free_per_email
  ON public.api_keys(lower(email))
  WHERE tier IN ('developer', 'alpha') AND is_active;
