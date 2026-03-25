-- Per-agent daily usage tracking for delegated agents
CREATE TABLE IF NOT EXISTS agent_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  agent_wallet TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  contract_count INT NOT NULL DEFAULT 0,
  UNIQUE(api_key_id, agent_wallet, date)
);

CREATE INDEX IF NOT EXISTS idx_agent_usage_lookup
  ON agent_usage(api_key_id, agent_wallet, date);

-- Configurable per-agent daily limit on API keys (default 10)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS agent_daily_limit INT DEFAULT 10;
