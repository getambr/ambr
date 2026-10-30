-- 2026-09-02: Bilateral termination for commerce and consumer contracts.
--
-- WHY. On 2026-08-25 revoke/route.ts stopped letting one party end a commerce or
-- consumer contract alone, and pointed callers at the amendment flow instead. That
-- was right about revocation and wrong about the destination: amendment's only
-- terminal write is status='amended', which mints a SUCCESSOR contract. So since
-- 2026-08-25 those two categories have had no path to any ended state at all. This
-- migration builds the missing door.
--
-- NO STATUS MIGRATION IS NEEDED, and none is attempted here. enforce_status_transition()
-- (20260611160000_handshake_and_expiry_semantics.sql:42-52) already permits
-- active -> terminated, active -> disputed, disputed -> active|terminated, and makes
-- terminated terminal. Both statuses are already in the CHECK constraint added by
-- 20260611120000_revocation_expiry_fix.sql. Nothing in src/ has ever written either
-- one. The permission existed; only the door was missing. This file does not touch
-- either trigger or either constraint.
--
-- REVIEW CRITERION. This file must not modify or delete a single existing row when
-- applied. Every top-level statement is CREATE, ALTER ... ADD COLUMN IF NOT EXISTS,
-- or REVOKE. The only UPDATE statements are inside accept_termination()'s body, which
-- runs when the application calls it, never at migration time. Check for top-level
-- destructive statements with:
--     grep -nE '^(UPDATE|DELETE|DROP|TRUNCATE|ALTER TABLE [^ ]+ DROP)' <this file>
-- which must return nothing.

-- ---------------------------------------------------------------------------
-- 1. Termination facts on the contract itself
-- ---------------------------------------------------------------------------

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS terminated_at timestamptz;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS terminated_by text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS termination_reason text;

COMMENT ON COLUMN public.contracts.terminated_by IS
  'Who ended it, following the revoked_by convention: mutual:0x<proposer>+0x<acceptor>.';

-- ---------------------------------------------------------------------------
-- 2. The proposals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.termination_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

  -- The signature IS the credential. proposer_wallet is derived from it by ecrecover
  -- in the route and stored for display; it is never accepted as an assertion. This
  -- is the difference from amendment_proposals.proposer_wallet, which is an unsigned
  -- string accepted on membership in a holder set that GET /amendments publishes
  -- without authentication.
  proposer_wallet     text NOT NULL,
  proposer_signature  text NOT NULL,
  proposer_message    text NOT NULL,
  proposer_api_key_id uuid REFERENCES public.api_keys(id),

  -- An assertion by the proposer, not a finding by Ambr. Ambr does not adjudicate
  -- whether cause exists; it records that cause was claimed, with a signature attached.
  ground text NOT NULL DEFAULT 'convenience'
    CHECK (ground IN ('convenience', 'cause', 'mutual')),
  reason text,

  -- The contract's own notice period, frozen at proposal time, plus the key it came
  -- from so the number is auditable rather than magic.
  notice_period_hours integer NOT NULL DEFAULT 0
    CHECK (notice_period_hours BETWEEN 0 AND 8760),
  notice_source text NOT NULL DEFAULT 'none',
  effective_at  timestamptz NOT NULL,

  -- Display only. Authority is re-derived from live cNFT ownership at response time,
  -- never from this column. Recorded so the reader can show who was asked.
  counterparty_wallet_at_proposal text NOT NULL,
  holders_from_chain boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),

  accepted_by_wallet text,
  accepted_signature text,
  accepted_message   text,
  accepted_at        timestamptz,
  notice_waived      boolean,
  responder_reason   text,

  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most one open proposal per contract, enforced in the schema rather than by a
-- read-then-write check in the route, where a race can get around it. The amendment
-- flow has no such guard: N proposals can sit pending on one contract, and whichever
-- is approved first flips the original, after which the rest fail with a confusing 422.
CREATE UNIQUE INDEX IF NOT EXISTS termination_proposals_one_open
  ON public.termination_proposals (contract_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS termination_proposals_contract
  ON public.termination_proposals (contract_id);

CREATE INDEX IF NOT EXISTS termination_proposals_pending_for_wallet
  ON public.termination_proposals (counterparty_wallet_at_proposal) WHERE status = 'pending';

-- No policies, deliberately. service_role bypasses RLS and every reference in the app
-- goes through getSupabaseAdmin(). Default-deny for anon/authenticated is the correct
-- posture for a server-only table, matching amendment_proposals and the set fixed by
-- 20260520000000_enable_rls_server_only_tables.sql. The anon key ships in the page
-- source of every request, so this is not a formality.
ALTER TABLE public.termination_proposals ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Accepting, atomically
-- ---------------------------------------------------------------------------

-- Two writes have to land together: the contract becomes terminated and the proposal
-- becomes accepted. amendments/[proposalId]/approve spreads five writes across no
-- transaction at all and documents the resulting partial-failure window; with only
-- two writes, atomicity costs almost nothing, so it is taken.
--
-- Ordering inside is contract-first on purpose. "Proposal accepted, contract still
-- live" is the state a party would wrongly rely on. "Contract terminated, proposal
-- stale" is recoverable and both signatures survive on the row. Neither is reachable
-- through this function; the ordering is the backstop if it is ever inlined.
CREATE OR REPLACE FUNCTION public.accept_termination(
  p_proposal_id  uuid,
  p_contract_id  uuid,
  p_acceptor     text,
  p_signature    text,
  p_message      text,
  p_terminated_by text,
  p_notice_waived boolean
) RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_reason text;
BEGIN
  -- Serialization point. A second concurrent acceptance blocks here, then finds the
  -- row is no longer pending and raises.
  SELECT reason INTO v_reason
    FROM public.termination_proposals
   WHERE id = p_proposal_id
     AND contract_id = p_contract_id
     AND status = 'pending'
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_not_pending';
  END IF;

  -- The status predicate is what makes this safe against a contract that moved
  -- between propose and accept. enforce_status_transition() is still the backstop.
  UPDATE public.contracts
     SET status             = 'terminated',
         terminated_at      = v_now,
         terminated_by      = p_terminated_by,
         termination_reason = v_reason
   WHERE id = p_contract_id
     AND status IN ('active', 'disputed')
     AND terminated_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_state_changed';
  END IF;

  UPDATE public.termination_proposals
     SET status             = 'accepted',
         accepted_by_wallet = p_acceptor,
         accepted_signature = p_signature,
         accepted_message   = p_message,
         accepted_at        = v_now,
         notice_waived      = p_notice_waived
   WHERE id = p_proposal_id;

  RETURN v_now;
END;
$$;

-- Not SECURITY DEFINER: service_role already bypasses RLS, so the function needs no
-- elevation, and giving it any would make the grant below the only thing standing
-- between the anon key and an arbitrary contract termination.
REVOKE ALL ON FUNCTION public.accept_termination(uuid, uuid, text, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.accept_termination IS
  'Terminates a contract and marks its proposal accepted in one transaction. Callable by service_role only.';
