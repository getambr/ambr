-- Delegation columns on api_keys (one key = one principal)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS principal_wallet TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS delegation_scope JSONB
  DEFAULT '{"actions": ["create", "handshake", "read"]}';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS delegation_registered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_api_keys_principal_wallet
  ON api_keys(principal_wallet) WHERE principal_wallet IS NOT NULL;

-- Agent source tracking on handshakes
ALTER TABLE handshakes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct';
ALTER TABLE handshakes ADD COLUMN IF NOT EXISTS agent_api_key_id UUID;
ALTER TABLE handshakes ADD COLUMN IF NOT EXISTS principal_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE handshakes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Check constraint for source
DO $$ BEGIN
  ALTER TABLE handshakes ADD CONSTRAINT handshakes_source_check
    CHECK (source IN ('direct', 'agent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
