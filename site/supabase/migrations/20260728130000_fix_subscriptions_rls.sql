-- SECURITY FIX — public.subscriptions was anon-writable AND anon-readable.
--
-- 20260420000000_subscriptions.sql created:
--
--   CREATE POLICY "subscriptions_service_role"
--     ON subscriptions FOR ALL USING (true) WITH CHECK (true);
--
-- The name says service_role, but there is no `TO service_role` clause, so
-- Postgres defaulted the policy to the **public** role. Confirmed live on
-- 2026-07-28 via pg_policies: roles=public, cmd=ALL, qual=true, with_check=true
-- ⇒ anon and authenticated held full CRUD on a table containing `email`,
-- `stripe_customer_id` and `stripe_subscription_id`.
--
-- Proven exploitable before this migration: an anon-key POST to
-- /rest/v1/subscriptions returned **201 Created** and persisted the row. The
-- anon key is in the page source of every getamber.dev request, so this was
-- reachable by anyone. It had not leaked data only because the table was empty.
--
-- The policy was never needed: service_role bypasses RLS entirely, and every
-- reference to this table in the codebase (src/app/api/v1/stripe/webhook/route.ts,
-- the only file that queries it) goes through getSupabaseAdmin(). Dropping it
-- restores default-deny for anon/authenticated, matching the posture of
-- counterparty_verifications, identity_nullifiers, email_events and the tables
-- remediated in 20260520000000_enable_rls_server_only_tables.sql.
--
-- Applied to production via Supabase MCP apply_migration on 2026-07-28.

DROP POLICY IF EXISTS "subscriptions_service_role" ON public.subscriptions;

-- Belt and braces: the table already had RLS on, but assert it rather than
-- assume — with the policy gone, RLS is the only thing standing between the
-- anon key and this data.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
-- No policies created → service-role-only access, anon key blocked.
