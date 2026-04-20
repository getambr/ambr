-- Subscription plans for regular users (Personal, Business, Enterprise)
-- Tied to Stripe recurring billing

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('personal', 'business', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  contracts_limit INTEGER NOT NULL DEFAULT 25,
  contracts_used INTEGER NOT NULL DEFAULT 0,
  ai_messages_limit INTEGER NOT NULL DEFAULT -1,
  ai_messages_used INTEGER NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_email ON subscriptions (email);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions (stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_service_role"
  ON subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
