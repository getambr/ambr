-- Remove anonymous read access to `signatures`.
--
-- Without this migration, the policy "Public can read signatures" grants SELECT
-- to role `public` with USING(true): the entire who-signed-what graph across
-- every contract, including private ones, readable by anyone holding the
-- publishable anon key.
-- Wallet addresses, contract ids and signing timestamps for all parties.
--
-- It is the last table the earlier lockdown left open: api_keys, handshakes,
-- share_tokens, x402_payments and wallet_reputation are all service_role_only,
-- and `signatures` is strictly more sensitive than most of them.
--
-- Nothing depends on it. Every legitimate reader uses the service-role client,
-- which bypasses RLS entirely: the reader page (server-rendered, getSupabaseAdmin),
-- the sign/revoke/status/wallet-auth routes, and the chain helpers. Verified by
-- grepping every `from('signatures')` call site before dropping.
--
-- RLS stays enabled on the table, so with no policy the anon role reads nothing.

drop policy if exists "Public can read signatures" on public.signatures;

alter table public.signatures enable row level security;
