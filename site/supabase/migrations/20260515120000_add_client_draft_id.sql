-- Add nullable client_draft_id to contracts so a server-stored contract
-- can be linked back to its originating IndexedDB draft on the client.
-- Used by the chat-driven deploy flow to drop the local draft after
-- POST /api/v1/contracts succeeds, and (in v1.5) to merge local + server
-- views on the Drafts page.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_draft_id TEXT;

CREATE INDEX IF NOT EXISTS contracts_client_draft_id_idx
  ON public.contracts (client_draft_id)
  WHERE client_draft_id IS NOT NULL;

COMMENT ON COLUMN public.contracts.client_draft_id IS
  'Optional UUID generated client-side when a contract is drafted in IndexedDB before deploy. Lets the client remove the matching local draft and (later) sync drafts cross-device.';
