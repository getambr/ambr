-- Add the columns that chat/route.ts has been referencing in its inserts
-- since 2026-05-26 but were never migrated. Inserts have been failing
-- silently because `recordUsage()` swallows Supabase errors in a try/catch
-- that's actually a no-op (the .insert() returns {error} rather than
-- throwing). Result: zero observable rows in chat_usage for the last
-- several days even though the chat endpoint was running thousands of
-- requests.
--
-- Found 2026-05-27 while building /api/v1/analytics — the chat_usage
-- summary couldn't pull cost/model breakdowns because the writes weren't
-- landing. Migration adds the missing columns so future inserts succeed
-- AND historical inserts that DID land (without these columns) stay
-- intact.

ALTER TABLE public.chat_usage
  ADD COLUMN IF NOT EXISTS cached_tokens INT NULL,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_ms INT NULL;

COMMENT ON COLUMN public.chat_usage.cached_tokens IS 'Prompt-cache hit tokens reported by Moonshot/Anthropic. cache_hit_rate = cached_tokens / input_tokens. Null when the provider does not report it.';
COMMENT ON COLUMN public.chat_usage.fallback_used IS 'True when the primary LLM provider failed and the secondary rescued this turn. Lets us track status=ok + fallback_used=true (transparent recovery).';
COMMENT ON COLUMN public.chat_usage.duration_ms IS 'Wall-clock duration in ms of the LLM call (sum across primary + fallback if the wrapper retried).';

-- Drop the swallowed-error try/catch pattern by also surfacing the
-- supabase error from recordUsage() — but that's a code change, lives in
-- src/app/api/v1/chat/route.ts. Migration only ensures the columns exist.
