-- Principal-approval columns: declare in migrations what production already has.
--
-- oversight_threshold_usd, principal_approval_required, principal_approved_at
-- and principal_approved_by are written by contract-engine.ts and both approve
-- routes, so they must exist in supabase/migrations. Production already has
-- them, applied out of band. Without this migration, `supabase db reset` or any
-- branch database produces a schema where the contracts POST fails outright,
-- because contract-engine always sends the first two columns.
--
-- Same class of drift, and same repair, as 20260611120000_revocation_expiry_fix.sql,
-- which documented and fixed it for the revoked_* columns. IF NOT EXISTS
-- throughout, so this is a no-op against production and a fix everywhere else.

alter table contracts add column if not exists oversight_threshold_usd     numeric;
alter table contracts add column if not exists principal_approval_required boolean default false;
alter table contracts add column if not exists principal_approved_at       timestamptz;
alter table contracts add column if not exists principal_approved_by       text;

-- Find contracts still waiting on a human without scanning the whole table.
create index if not exists contracts_awaiting_principal_approval_idx
  on contracts (status)
  where status = 'awaiting_principal_approval';

-- ── Defence in depth for the approval gate ──────────────────────────────────
--
-- enforce_status_transition() (20260611160000_handshake_and_expiry_semantics.sql)
-- has no branch for OLD.status = 'awaiting_principal_approval'. Every IF is keyed
-- on some other origin status, so an update out of that state matches nothing and
-- falls through to RETURN NEW — the database permits awaiting_principal_approval
-- -> anything, including straight to 'active'. Without a guard here, the entire
-- Article 14 gate rests on one if-statement in one route handler.
--
-- A contract awaiting a human may only move to 'draft' (approved), or to one of
-- the terminal states that can befall any contract. It may NOT jump to
-- pending_signature or active, which would skip approval and signing together.
create or replace function enforce_awaiting_approval_transition()
returns trigger
language plpgsql
-- Pinned, matching enforce_status_transition(). An unpinned search_path on a
-- SECURITY INVOKER trigger is what Supabase's advisor flags, and the sibling
-- function in this same table already sets it.
set search_path = public
as $$
begin
  if OLD.status = 'awaiting_principal_approval'
     and NEW.status is distinct from OLD.status
     and NEW.status not in ('draft', 'revoked', 'expired', 'terminated') then
    raise exception
      'invalid status transition: awaiting_principal_approval -> % (principal approval moves a contract to draft)',
      NEW.status;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_awaiting_approval_transition on contracts;

create trigger trg_enforce_awaiting_approval_transition
  before update on contracts
  for each row
  execute function enforce_awaiting_approval_transition();
