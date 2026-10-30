-- Per-contract transactional notifications.
-- Three email events ship today: share_invite, counterparty_signed, contract_activated.
-- Mirrors the beta_invite_emails shape so behaviour is consistent across the platform.

-- Persist counterparty email on contracts (last-write-wins: sender pre-fills at share,
-- counterparty's own email at sign overrides). Nullable because either side may opt out.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS counterparty_email TEXT;

-- Transactional email log + dedup, parallel to beta_invite_emails.
CREATE TABLE IF NOT EXISTS contract_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  event text NOT NULL,                  -- 'share_invite' | 'counterparty_signed' | 'contract_activated'
  recipient_email text NOT NULL,
  recipient_role text NOT NULL,         -- 'sender' | 'counterparty'
  status text NOT NULL DEFAULT 'queued', -- 'queued' | 'sent' | 'failed'
  resend_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_contract_notification_log_contract
  ON contract_notification_log(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_notification_log_event
  ON contract_notification_log(event, status, created_at DESC);

-- Never send the same event to the same recipient twice. Failures and retries are
-- represented as separate rows up until one reaches status='sent'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_notification_log_unique_sent
  ON contract_notification_log(contract_id, event, recipient_email)
  WHERE status = 'sent';
