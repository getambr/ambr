-- Stripe columns on api_keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS stripe_payment_intent text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'crypto';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS pending_key_display text;

-- Make tx_hash nullable (Stripe keys don't have one)
ALTER TABLE api_keys ALTER COLUMN tx_hash DROP NOT NULL;

-- Payment method check constraint
DO $$ BEGIN
  ALTER TABLE api_keys ADD CONSTRAINT api_keys_payment_method_check
    CHECK (payment_method IN ('crypto', 'stripe'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend existing audit_log table (already has id, contract_id, action, actor, details, created_at)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address text;

-- Backfill event_type from existing 'action' column
UPDATE audit_log SET event_type = action WHERE event_type IS NULL AND action IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_event_created ON audit_log(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created ON audit_log(actor, created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Velocity tracking table
CREATE TABLE IF NOT EXISTS velocity_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  tx_count_hour int NOT NULL DEFAULT 0,
  usd_volume_hour numeric NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL,
  is_paused boolean DEFAULT false,
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_velocity_wallet_window ON velocity_tracking(wallet_address, window_start);

ALTER TABLE velocity_tracking ENABLE ROW LEVEL SECURITY;
