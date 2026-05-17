-- Extend the chat_usage.status CHECK constraint to allow 'access_denied'.
-- This status is written by /api/v1/chat when checkBetaAccess() rejects a
-- request — surfaces the gap that previously existed when the chat surface
-- was client-side-gated only (a non-admin with a valid API key could hit
-- the endpoint directly; now we 403 + audit log instead of silently allowing).

ALTER TABLE public.chat_usage
  DROP CONSTRAINT IF EXISTS chat_usage_status_check;

ALTER TABLE public.chat_usage
  ADD CONSTRAINT chat_usage_status_check CHECK (
    status IN ('ok', 'rate_limited', 'budget_exhausted', 'injection_blocked', 'llm_error', 'validation_error', 'access_denied')
  );
