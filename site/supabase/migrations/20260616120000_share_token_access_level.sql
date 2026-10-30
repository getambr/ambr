-- Scope-only share tokens (2026-06-16)
--
-- A share token can grant either 'full' access (the entire contract incl. the
-- principal's name/address/registration — for lawyers/counterparties who need
-- it) or 'scope' access (only the capability summary + validity + hash, with
-- all identity/PII and full prose redacted — data-minimization for proving an
-- agent's authority without exposing the principal).
--
-- Default 'full' preserves every existing token's behavior.
-- Applied to production via Supabase MCP apply_migration on 2026-06-16.
ALTER TABLE public.share_tokens
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'full';

ALTER TABLE public.share_tokens
  DROP CONSTRAINT IF EXISTS share_tokens_access_level_check;
ALTER TABLE public.share_tokens
  ADD CONSTRAINT share_tokens_access_level_check CHECK (access_level IN ('full', 'scope'));
