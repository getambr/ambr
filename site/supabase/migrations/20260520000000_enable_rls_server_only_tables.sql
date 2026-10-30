-- 2026-05-20: Enable RLS on 4 server-only tables that were exposed to the
-- anon Supabase key.
--
-- Discovered via Supabase Security Advisor — all 4 tables had RLS disabled
-- AND anon role held full CRUD grants. The anon key is exposed in the page
-- source of every getamber.dev request (NEXT_PUBLIC_SUPABASE_ANON_KEY), so
-- anyone could read recipient_emails, harvest beta-invite addresses, read
-- chat_usage cost data, or DESTROY rows in these tables via PostgREST.
--
-- Confirmed leakage before fix (curl with anon key returned real PII like
-- a real recipient address from contract_notification_log). After this migration,
-- the same curl returns [] for all 4 tables.
--
-- No policies added — service_role bypasses RLS, and every reference to
-- these tables in the app codebase goes through getSupabaseAdmin() which
-- uses SUPABASE_SERVICE_ROLE_KEY. Default-deny for anon/authenticated is
-- the correct posture for these server-only tables. Matches the pattern
-- already used by agent_usage, amendment_proposals, identity_nullifiers,
-- rate_limits, team_members, velocity_tracking.

ALTER TABLE public.beta_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_invite_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_notification_log ENABLE ROW LEVEL SECURITY;
