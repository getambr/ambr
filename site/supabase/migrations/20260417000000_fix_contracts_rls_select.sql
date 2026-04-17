-- Replace the open USING(true) SELECT policy on contracts with
-- visibility-based access control. Only contracts marked 'public'
-- are readable via the anon/authenticated Supabase client.
--
-- API routes use getSupabaseAdmin() (service_role), which bypasses
-- RLS entirely — no impact on existing REST/MCP/A2A functionality.

BEGIN;

DROP POLICY IF EXISTS "Public can read contracts" ON public.contracts;

CREATE POLICY "Select public contracts"
  ON public.contracts
  FOR SELECT
  USING (visibility = 'public');

COMMIT;
