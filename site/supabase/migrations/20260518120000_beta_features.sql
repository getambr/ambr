-- Per-account beta feature flags + grant audit + invite-email send log.
-- Adds runtime DB toggle for the Ambr Agent (AI chat) feature, so we can
-- grant access to individual testers without code commits.

-- ---------------------------------------------------------------------------
-- 1. JSONB column on api_keys to hold per-account feature toggles.
-- Today stores { "ai_chat": true }; future features land in the same column
-- (e.g. { "ai_chat": true, "workflow_v2": false }) without schema changes.
-- ---------------------------------------------------------------------------
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS beta_features JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index for the most-common lookup: "show me everyone with ai_chat beta on".
-- Partial index keeps it cheap — only rows where the flag is literally 'true'.
CREATE INDEX IF NOT EXISTS idx_api_keys_beta_ai_chat
  ON api_keys ((beta_features->>'ai_chat'))
  WHERE beta_features->>'ai_chat' = 'true';

-- ---------------------------------------------------------------------------
-- 2. beta_access_grants — audit trail for every grant/revoke action.
-- Keeps history; never delete rows. Tracks who granted what, when.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beta_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  feature text NOT NULL,                  -- 'ai_chat' today, extensible
  granted boolean NOT NULL,               -- true = grant, false = revoke
  granted_by_email text NOT NULL,         -- admin email who acted
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes text                              -- optional context ("invited as investor")
);

CREATE INDEX IF NOT EXISTS idx_beta_access_grants_api_key
  ON beta_access_grants(api_key_id);

CREATE INDEX IF NOT EXISTS idx_beta_access_grants_feature
  ON beta_access_grants(feature, granted_at DESC);

-- ---------------------------------------------------------------------------
-- 3. beta_invite_emails — outbound invite-email queue + send log.
-- Prevents double-sends and enables retries on failed Resend deliveries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beta_invite_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  feature text NOT NULL,
  status text NOT NULL DEFAULT 'queued',  -- 'queued' | 'sent' | 'failed'
  resend_id text,                         -- Resend message id, for debugging
  error_message text,                     -- last failure reason if any
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_beta_invite_emails_status
  ON beta_invite_emails(status, created_at);

-- Only one successful 'sent' row per (api_key_id, feature) — never spam testers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_beta_invite_emails_unique_sent
  ON beta_invite_emails(api_key_id, feature)
  WHERE status = 'sent';
