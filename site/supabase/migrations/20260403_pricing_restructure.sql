-- Phase 2 Pricing Restructure Migration
-- Run against Supabase project: xoepsyapvuzijuyrvmbz (Amber Protocol)

-- 1. Update tier check constraint to include new tier names
-- First drop old constraint, then add new one
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_tier_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_tier_check
  CHECK (tier IN ('alpha', 'developer', 'starter', 'startup', 'builder', 'scale', 'enterprise'));

-- 2. Migrate existing alpha keys to developer tier (optional — preserves backwards compat)
-- Uncomment to migrate: UPDATE api_keys SET tier = 'developer' WHERE tier = 'alpha';

-- 3. Migrate existing starter keys to startup, builder to scale (optional)
-- Uncomment to migrate: UPDATE api_keys SET tier = 'startup' WHERE tier = 'starter';
-- Uncomment to migrate: UPDATE api_keys SET tier = 'scale' WHERE tier = 'builder';

-- 4. Update payment_method check constraint if it exists
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_payment_method_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_payment_method_check
  CHECK (payment_method IN ('free', 'crypto', 'stripe', 'x402', NULL));

-- 5. Update template prices to match new x402 pricing
UPDATE templates SET price_cents = 50 WHERE slug LIKE 'd1-%' OR slug LIKE 'd2-%';
UPDATE templates SET price_cents = 250 WHERE slug LIKE 'd3-%';
UPDATE templates SET price_cents = 100 WHERE slug LIKE 'c1-%' OR slug LIKE 'c2-%' OR slug LIKE 'c3-%';
