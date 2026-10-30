-- Revocation + expiry fix (2026-06-11)
--
-- Fixes the broken revocation path: the revoke endpoint, dashboard button, and
-- reader banners all exist, but the status-transition trigger rejected
-- active -> revoked, so every revocation of an active contract failed with 500.
-- Also reconciles status CHECK drift and makes expiry_date real (computed on
-- insert from template parameters, backfilled for existing rows).
--
-- Applied to production via Supabase MCP apply_migration on 2026-06-11.

-- 0) Revocation/expiry columns. Production already has these (added out-of-band
--    during the May drift); IF NOT EXISTS makes this file self-contained so a
--    fresh database (supabase db reset / branch DB) can replay the history.
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS revoked_by text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS revocation_reason text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS expiry_date timestamptz;

-- 1) Status CHECK: union of statuses referenced by code, trigger, and prod data.
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check CHECK (status IN (
  'draft', 'handshake', 'pending_signature', 'active', 'fulfilled', 'disputed',
  'amended', 'terminated', 'expired', 'revoked', 'awaiting_principal_approval'
));

-- 2) Transition guard: allow revocation + expiry; same-status updates are a no-op.
CREATE OR REPLACE FUNCTION public.enforce_status_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status NOT IN ('pending_signature', 'active') THEN
    RAISE EXCEPTION 'Invalid transition from draft to %', NEW.status;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'active' AND COALESCE(NEW.is_one_sided, false) = false THEN
    RAISE EXCEPTION 'Bilateral contracts must transition through pending_signature before active';
  END IF;

  IF OLD.status = 'pending_signature' AND NEW.status NOT IN ('active', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'Invalid transition from pending_signature to %', NEW.status;
  END IF;

  IF OLD.status = 'active' AND NEW.status NOT IN ('fulfilled', 'disputed', 'terminated', 'amended', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'Invalid transition from active to %', NEW.status;
  END IF;

  IF OLD.status IN ('fulfilled', 'terminated', 'amended', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'Cannot transition from terminal status: %', OLD.status;
  END IF;

  IF OLD.status = 'disputed' AND NEW.status NOT IN ('active', 'terminated') THEN
    RAISE EXCEPTION 'Invalid transition from disputed to %', NEW.status;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Compute expiry_date on insert from template parameters.
--    Sources, in priority order: end_date, expires_at (absolute dates),
--    duration_months (relative to created_at). Malformed values never block
--    an insert -- expiry_date just stays NULL.
CREATE OR REPLACE FUNCTION public.compute_contract_expiry()
RETURNS trigger AS $$
BEGIN
  IF NEW.expiry_date IS NOT NULL OR NEW.parameters IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF NEW.parameters->>'end_date' ~ '^\d{4}-\d{2}-\d{2}' THEN
      NEW.expiry_date := (NEW.parameters->>'end_date')::timestamptz;
    ELSIF NEW.parameters->>'expires_at' ~ '^\d{4}-\d{2}-\d{2}' THEN
      NEW.expiry_date := (NEW.parameters->>'expires_at')::timestamptz;
    ELSIF NEW.parameters->>'duration_months' ~ '^\d{1,3}$' THEN
      NEW.expiry_date := COALESCE(NEW.created_at, now())
        + ((NEW.parameters->>'duration_months')::int * interval '1 month');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.expiry_date := NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compute_expiry_on_insert ON public.contracts;
CREATE TRIGGER compute_expiry_on_insert
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.compute_contract_expiry();

-- 4) Backfill expiry_date for existing contracts, one row at a time so a
--    single malformed value cannot abort the migration.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, created_at, parameters FROM public.contracts
    WHERE expiry_date IS NULL AND parameters IS NOT NULL
  LOOP
    BEGIN
      IF r.parameters->>'end_date' ~ '^\d{4}-\d{2}-\d{2}' THEN
        UPDATE public.contracts SET expiry_date = (r.parameters->>'end_date')::timestamptz WHERE id = r.id;
      ELSIF r.parameters->>'expires_at' ~ '^\d{4}-\d{2}-\d{2}' THEN
        UPDATE public.contracts SET expiry_date = (r.parameters->>'expires_at')::timestamptz WHERE id = r.id;
      ELSIF r.parameters->>'duration_months' ~ '^\d{1,3}$' THEN
        UPDATE public.contracts SET expiry_date = r.created_at + ((r.parameters->>'duration_months')::int * interval '1 month') WHERE id = r.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping expiry backfill for %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
