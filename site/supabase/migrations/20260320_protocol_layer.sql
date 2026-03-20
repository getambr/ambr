-- Protocol Layer Migration: x402 payments, handshakes, reputation, visibility
-- Additive changes only — no dropping columns or tables

-- 1. Make api_key_id nullable for x402 contracts (no API key needed)
ALTER TABLE contracts ALTER COLUMN api_key_id DROP NOT NULL;

-- 2. Add visibility and payment tracking to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private'
  CHECK (visibility IN ('private', 'metadata_only', 'public', 'encrypted'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS publish_targets TEXT[] DEFAULT '{}';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS encryption_metadata JSONB DEFAULT NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payer_wallet TEXT DEFAULT NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'api_key'
  CHECK (payment_method IN ('api_key', 'x402', 'usdc_direct'));

-- 3. Add identity enrichment to signatures
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_identity JSONB DEFAULT NULL;

-- 4. Add 'handshake' to contract status options
-- The existing status column uses a CHECK constraint; we need to replace it
-- First check if the constraint exists and drop it, then add the updated one
DO $$
BEGIN
  -- Try to drop the existing check constraint on status
  -- The constraint name may vary, so we handle both cases
  BEGIN
    ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  -- Add updated check with 'handshake' status
  ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
    CHECK (status IN ('draft', 'handshake', 'pending_signature', 'active', 'fulfilled', 'disputed', 'amended', 'terminated'));
END$$;

-- 5. x402 payment log
CREATE TABLE IF NOT EXISTS x402_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash TEXT UNIQUE NOT NULL,
  payer_wallet TEXT NOT NULL,
  amount_usdc NUMERIC NOT NULL DEFAULT 0,
  contract_id UUID REFERENCES contracts(id) DEFAULT NULL,
  template_slug TEXT NOT NULL DEFAULT 'unknown',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  chain TEXT DEFAULT 'base',
  raw_proof JSONB DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_x402_payments_payer ON x402_payments(payer_wallet);
CREATE INDEX IF NOT EXISTS idx_x402_payments_contract ON x402_payments(contract_id);

-- 6. Wallet reputation
CREATE TABLE IF NOT EXISTS wallet_reputation (
  wallet_address TEXT PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}',
  contracts_fulfilled INTEGER DEFAULT 0,
  contracts_disputed INTEGER DEFAULT 0,
  contracts_total INTEGER DEFAULT 0,
  total_value_usdc NUMERIC DEFAULT 0,
  demos_identity_depth INTEGER DEFAULT 0,
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Handshake intent records
CREATE TABLE IF NOT EXISTS handshakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  wallet_address TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('accept', 'reject', 'request_changes')),
  message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contract_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_handshakes_contract ON handshakes(contract_id);

-- 8. Index for wallet-based contract lookup (x402 flow)
CREATE INDEX IF NOT EXISTS idx_contracts_payer_wallet ON contracts(payer_wallet) WHERE payer_wallet IS NOT NULL;

-- 9. Fix Security Advisor warning: contracts_metadata view should use SECURITY INVOKER
-- Recreate with SECURITY INVOKER + add visibility column
DROP VIEW IF EXISTS public.contracts_metadata;
CREATE VIEW public.contracts_metadata
  WITH (security_invoker = true)
AS
  SELECT
    id,
    contract_id,
    status,
    sha256_hash,
    amendment_type,
    parent_contract_hash,
    contract_type,
    visibility,
    created_at,
    updated_at
  FROM public.contracts;
