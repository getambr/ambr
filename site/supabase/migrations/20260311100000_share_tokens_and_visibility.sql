-- ============================================================
-- Ambr — Share Tokens + GDPR Visibility Controls
-- Migration: 20260311100000
--
-- Adds share_tokens table for consent-based contract sharing.
-- Tightens contract visibility: public metadata, private full text.
-- Application-level enforcement (API routes + Reader Portal).
-- ============================================================

-- 1. Share tokens table
CREATE TABLE IF NOT EXISTS public.share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) NOT NULL,
  token text UNIQUE NOT NULL,
  created_by_wallet text,
  created_by_api_key_id uuid,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON public.share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_contract ON public.share_tokens(contract_id);

ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write share tokens (application-enforced)
-- No public policy — tokens are validated via API routes using getSupabaseAdmin()

-- 2. Contracts metadata view (public-safe fields only)
-- This view is what unauthenticated users should see.
-- Full contract text is served only via authenticated API routes.
CREATE OR REPLACE VIEW public.contracts_metadata AS
  SELECT
    id,
    contract_id,
    status,
    sha256_hash,
    amendment_type,
    parent_contract_hash,
    contract_type,
    created_at,
    updated_at
  FROM public.contracts;

-- 3. Add signature_level column to signatures (future QES support)
ALTER TABLE public.signatures ADD COLUMN IF NOT EXISTS signature_level text
  DEFAULT 'advanced'
  CHECK (signature_level IN ('simple', 'advanced', 'qualified'));

-- 4. Document the RLS design decision
-- NOTE: contracts table keeps USING(true) SELECT policy for now.
-- Visibility is enforced at the application layer:
--   - Reader Portal: metadata-only for unauthenticated, full text with share token
--   - REST API: full text requires API key (contract creator) or share token
--   - MCP: full text requires API key
--   - ambr_verify_hash: metadata only (always public)
--
-- Phase 2: Replace USING(true) with proper RLS using share_tokens + wallet matching.
-- This requires Supabase auth integration (JWT claims with wallet address).
