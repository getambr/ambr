-- Resend webhook event log — email engagement (opens, clicks, bounces).
-- One row per delivered webhook event from https://resend.com/webhooks.
--
-- Why: outbound email had no feedback loop. contract_notification_log and
-- beta_invite_emails record that we *asked* Resend to send something, but
-- nothing recorded whether it was delivered, opened, or clicked. Investor
-- outreach in particular was entirely blind.
--
-- Join key: resend_id == the `data.email_id` on the webhook payload == the id
-- returned by POST /emails and already stored on contract_notification_log
-- .resend_id and beta_invite_emails.resend_id. Neither of those columns is
-- unique today, so this is a logical join, not a foreign key.
--
-- Idempotency: svix_id is the Svix message id and is UNIQUE. Resend retries
-- delivery on any non-2xx, so the same event WILL arrive more than once; the
-- unique index makes the redelivery a no-op instead of a duplicate row.
--
-- Server-only: RLS enabled with NO policies, so only the service role (the
-- webhook route via getSupabaseAdmin) can read/write — mirrors
-- counterparty_verifications and identity_nullifiers. This table holds
-- recipient email addresses; the 2026-05-20 incident
-- (20260520000000_enable_rls_server_only_tables.sql) was exactly this class
-- of PII leaking through the anon key.
--
-- Applied to production via Supabase MCP apply_migration on 2026-07-28.
-- Verified after apply: relrowsecurity = true, 0 policies, and an anon-key
-- GET /rest/v1/email_events returns [].

CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id text NOT NULL,                     -- Svix message id; dedup key for redelivery
  resend_id text NOT NULL,                   -- data.email_id — joins the *_log tables
  event_type text NOT NULL
    CHECK (event_type IN (
      'email.sent',
      'email.scheduled',
      'email.delivered',
      'email.delivery_delayed',
      'email.bounced',
      'email.complained',
      'email.failed',
      'email.opened',
      'email.clicked'
    )),
  recipient_email text,                      -- data.to[0] — PII, hence RLS above
  subject text,
  tags jsonb,                                -- data.tags, e.g. {"campaign":"investor"}
  click_url text,                            -- data.click.link, only on email.clicked
  payload jsonb NOT NULL,                    -- the full webhook body, for replay/debug
  occurred_at timestamptz,                   -- data.created_at (provider clock)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Redelivery of the same Svix message must not create a second row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_svix_id
  ON public.email_events(svix_id);

CREATE INDEX IF NOT EXISTS idx_email_events_resend_id
  ON public.email_events(resend_id);

CREATE INDEX IF NOT EXISTS idx_email_events_type_created
  ON public.email_events(event_type, created_at DESC);

-- "Who opened the investor email" is the primary read; index the recipient.
CREATE INDEX IF NOT EXISTS idx_email_events_recipient
  ON public.email_events(recipient_email, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
-- No policies created → service-role-only access, anon key blocked.

COMMENT ON TABLE public.email_events IS 'Resend webhook event log (opens/clicks/bounces). Metadata only — no email body is stored. Server-only: RLS on, zero policies.';
