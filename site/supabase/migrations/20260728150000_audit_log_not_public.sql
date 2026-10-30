-- SECURITY — public.audit_log was world-readable and holds PII.
--
-- 20260311000000_schema_v2.sql created:
--
--   CREATE POLICY "Public can read audit log" ON public.audit_log
--     FOR SELECT USING (true);
--
-- No condition, granted to the `public` role, so anyone holding the anon key
-- (which ships in the page source of every request) could read every row.
--
-- The policy was serving nothing. Every one of the ten references to this
-- table in the codebase is an INSERT (src/lib/audit.ts, the contract
-- amend/approve/reject/handshake/sign/verify-party routes, cnft-mint), all
-- through getSupabaseAdmin() — service role, which bypasses RLS regardless.
-- Nothing anywhere reads audit_log: no API route, no page, no component.
--
-- This is not contract visibility. `contracts` keeps its intended policy
-- (public SELECT where visibility = 'public') and `signatures` stays publicly
-- readable — those are the public record. audit_log is internal operational
-- telemetry (download and payment events). It was never meant to be part of that
-- record; the policy predates logAudit() recording actors and IPs at all.
--
-- Applied to production via Supabase MCP apply_migration on 2026-07-28.
-- Verified after: an anon-key GET /rest/v1/audit_log returns [].

DROP POLICY IF EXISTS "Public can read audit log" ON public.audit_log;

-- RLS was already enabled; assert it rather than assume, since with the policy
-- gone it is the only thing between the anon key and this data.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- No policies remain → service-role-only access, anon key blocked.
