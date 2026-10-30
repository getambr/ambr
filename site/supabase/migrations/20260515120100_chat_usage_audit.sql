-- Audit log for /api/v1/chat usage.
-- Stores metadata only — NOT the prompt text or response text — so we can
-- detect abuse patterns without retaining user-supplied PII or contract
-- intent in our database. Per-day cost rollups feed the daily kill-switch.

CREATE TABLE IF NOT EXISTS public.chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode TEXT NOT NULL CHECK (mode IN ('deploy', 'ask')),
  identity_hash TEXT NOT NULL,      -- sha256 of api_key_id || ip (NEVER raw IP)
  api_key_id UUID NULL REFERENCES public.api_keys(id) ON DELETE SET NULL,
  message_count INT NOT NULL,        -- number of messages in the request
  total_input_chars INT NOT NULL,    -- sum of message lengths (no prompt text stored)
  input_tokens INT NULL,             -- reported by Anthropic API
  output_tokens INT NULL,
  cost_usd NUMERIC(10, 6) NULL,      -- estimated cost using list pricing
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'rate_limited', 'budget_exhausted', 'injection_blocked', 'llm_error', 'validation_error')),
  error_code TEXT NULL
);

CREATE INDEX IF NOT EXISTS chat_usage_created_at_idx ON public.chat_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS chat_usage_identity_hash_idx ON public.chat_usage (identity_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_usage_api_key_id_idx ON public.chat_usage (api_key_id, created_at DESC) WHERE api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_usage_status_idx ON public.chat_usage (status, created_at DESC) WHERE status != 'ok';

COMMENT ON TABLE public.chat_usage IS 'Audit log for /api/v1/chat. Metadata only — no prompt or response text — to support abuse detection and the daily $ budget kill-switch without retaining user content.';
COMMENT ON COLUMN public.chat_usage.identity_hash IS 'sha256(api_key_id || ip) — never the raw IP. Lets us correlate requests by anonymous actor without storing PII.';
COMMENT ON COLUMN public.chat_usage.cost_usd IS 'Estimated using Anthropic list pricing for the model. NULL if the request failed before incurring cost.';
