-- Handshake transitions + expiry semantics (2026-06-11, follow-up to revocation_expiry_fix)
--
-- 1) draft -> handshake was still rejected by the trigger while two live code
--    paths perform it (handshake route, MCP handshake) with unchecked errors,
--    making 'handshake' unreachable. Now allowed, and transitions OUT of
--    handshake are constrained instead of being wide open.
-- 2) duration_months expiry now anchors at ACTIVATION (the signing date the
--    contract prose promises), not at draft creation. Absolute end_date /
--    expires_at still anchor at insert. end_date is inclusive of its final
--    day. Existing backfilled rows are corrected accordingly.
-- 3) Both functions pin search_path = public.
--
-- Applied to production via Supabase MCP apply_migration on 2026-06-11.

CREATE OR REPLACE FUNCTION public.enforce_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status NOT IN ('handshake', 'pending_signature', 'active') THEN
    RAISE EXCEPTION 'Invalid transition from draft to %', NEW.status;
  END IF;

  IF OLD.status IN ('draft', 'handshake') AND NEW.status = 'active' AND COALESCE(NEW.is_one_sided, false) = false THEN
    RAISE EXCEPTION 'Bilateral contracts must transition through pending_signature before active';
  END IF;

  IF OLD.status = 'handshake' AND NEW.status NOT IN ('draft', 'pending_signature', 'active', 'revoked') THEN
    RAISE EXCEPTION 'Invalid transition from handshake to %', NEW.status;
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

  -- Duration-based terms run from the signing date (per the contract prose),
  -- so compute expiry_date at the moment of activation when no absolute
  -- expiry was already derived at insert.
  IF NEW.status = 'active' AND NEW.expiry_date IS NULL AND NEW.parameters IS NOT NULL THEN
    BEGIN
      IF NEW.parameters->>'duration_months' ~ '^\d{1,3}$'
         AND (NEW.parameters->>'duration_months')::int > 0 THEN
        NEW.expiry_date := now() + ((NEW.parameters->>'duration_months')::int * interval '1 month');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NEW.expiry_date := NULL;
    END;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Insert-time expiry: absolute dates always; duration_months only when the
-- row is born active (e.g. amendment successors), since that IS activation.
-- Each source has its own exception scope so one malformed value cannot
-- prevent the fallback sources from being tried.
CREATE OR REPLACE FUNCTION public.compute_contract_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expiry_date IS NOT NULL OR NEW.parameters IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parameters->>'end_date' ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN
      -- Inclusive of the final day: authority runs through end_date.
      NEW.expiry_date := (NEW.parameters->>'end_date')::timestamptz + interval '1 day';
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF NEW.parameters->>'expires_at' ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN
      NEW.expiry_date := (NEW.parameters->>'expires_at')::timestamptz;
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF NEW.status = 'active'
     AND NEW.parameters->>'duration_months' ~ '^\d{1,3}$'
     AND (NEW.parameters->>'duration_months')::int > 0 THEN
    BEGIN
      NEW.expiry_date := COALESCE(NEW.created_at, now())
        + ((NEW.parameters->>'duration_months')::int * interval '1 month');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Corrections to the earlier backfill:
-- (a) end_date rows become inclusive of their final day.
UPDATE public.contracts
SET expiry_date = (parameters->>'end_date')::timestamptz + interval '1 day'
WHERE parameters->>'end_date' ~ '^\d{4}-\d{2}-\d{2}'
  AND expiry_date = (parameters->>'end_date')::timestamptz;

-- (b) duration-based rows re-anchor to the contract's last signature
--     (the signing date) instead of draft creation, where signatures exist.
UPDATE public.contracts c
SET expiry_date = s.last_signed + ((c.parameters->>'duration_months')::int * interval '1 month')
FROM (
  SELECT contract_id, max(signed_at) AS last_signed
  FROM public.signatures
  GROUP BY contract_id
) s
WHERE s.contract_id = c.id
  AND c.parameters->>'duration_months' ~ '^\d{1,3}$'
  AND (c.parameters->>'duration_months')::int > 0
  AND c.parameters->>'end_date' IS NULL
  AND c.parameters->>'expires_at' IS NULL;

-- (c) duration-based rows that never activated lose the provisional value —
--     their term has not started; expiry is set at activation.
UPDATE public.contracts
SET expiry_date = NULL
WHERE status IN ('draft', 'handshake', 'pending_signature', 'awaiting_principal_approval')
  AND parameters->>'duration_months' ~ '^\d{1,3}$'
  AND parameters->>'end_date' IS NULL
  AND parameters->>'expires_at' IS NULL;
