CREATE TABLE IF NOT EXISTS rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_key_created ON rate_limits (key, created_at DESC);

-- Auto-cleanup: drop rows older than 2 hours
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
