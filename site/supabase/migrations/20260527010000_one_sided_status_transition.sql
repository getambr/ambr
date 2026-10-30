-- Allow one-sided contracts (P2 Power of Attorney etc.) to transition
-- directly from `draft` to `active`, bypassing `pending_signature`.
--
-- Why this exists: the original enforce_status_transition() trigger
-- (migration 20260311000000_schema_v2.sql) only permits draft → pending_sig
-- → active. That model assumes bilateral templates where two parties sign
-- before activation. P2 introduces a unilateral grant where the principal
-- signs once and the contract activates immediately — same FINAL state, but
-- reached without the intermediate `pending_signature` step.
--
-- The sign endpoint already enforces `is_one_sided && signer == principal_wallet`
-- before flipping status, so this looser transition is gated server-side.
-- The trigger relaxation just stops blocking the legitimate update.
--
-- Discovered 2026-05-27 when amb-2026-0032 (first prod P2 sign) had its
-- cNFT mint successfully but the status UPDATE silently failed because of
-- this trigger. Mint fired anyway because the in-memory `newStatus === 'active'`
-- branch ran regardless of whether the DB update landed. Net effect: an
-- active contract whose status column said `draft`. Fixed by both this
-- migration AND the sign-route error-handling hardening that surfaces
-- `update()` errors instead of swallowing them.

CREATE OR REPLACE FUNCTION public.enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- draft can go to pending_signature (bilateral) OR active (one-sided).
  -- One-sided is identified by NEW.is_one_sided=true; the sign endpoint
  -- gates this transition on principal-wallet identity, so the trigger
  -- just needs to permit the shape.
  IF OLD.status = 'draft' AND NEW.status NOT IN ('pending_signature', 'active') THEN
    RAISE EXCEPTION 'Invalid transition from draft to %', NEW.status;
  END IF;
  -- Additional gate: draft → active only allowed when is_one_sided = true.
  -- Bilateral templates must still go through pending_signature.
  IF OLD.status = 'draft' AND NEW.status = 'active' AND COALESCE(NEW.is_one_sided, false) = false THEN
    RAISE EXCEPTION 'Bilateral contracts must transition through pending_signature before active';
  END IF;
  -- pending_signature can only go to active
  IF OLD.status = 'pending_signature' AND NEW.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Invalid transition from pending_signature to %', NEW.status;
  END IF;
  -- active can go to fulfilled, disputed, terminated, or amended
  IF OLD.status = 'active' AND NEW.status NOT IN ('fulfilled', 'disputed', 'terminated', 'amended') THEN
    RAISE EXCEPTION 'Invalid transition from active to %', NEW.status;
  END IF;
  -- fulfilled and terminated are terminal
  IF OLD.status IN ('fulfilled', 'terminated', 'amended') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status;
  END IF;
  -- disputed can go back to active or to terminated
  IF OLD.status = 'disputed' AND NEW.status NOT IN ('active', 'terminated') THEN
    RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
  END IF;

  -- Auto-update updated_at
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: amb-2026-0032 already had its cNFT minted on Base L2 (token 18,
-- tx 0x3f0db59d5fdb8dbb429a35c56b8bc6b21f2a27139676f64826ef6b8a509031dd) at
-- 2026-05-26 21:43:39 UTC, but its DB row is stuck at status='draft' because
-- the trigger blocked the UPDATE. Now that the trigger permits draft→active
-- for is_one_sided=true, this UPDATE will succeed and the row will reflect
-- the on-chain reality. Idempotent: no-op if the row already moved to
-- another status (e.g. someone manually fixed it before this migration ran).
UPDATE public.contracts
SET status = 'active'
WHERE contract_id = 'amb-2026-0032'
  AND status = 'draft'
  AND is_one_sided = true
  AND nft_mint_status = 'minted';
