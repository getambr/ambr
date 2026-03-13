-- ============================================================
-- Ambr — Schema V2: Signatures, Audit Log, Status Machine
-- Migration: 20260311000000
-- ============================================================

-- 1. Expand status constraint on contracts
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('draft', 'active', 'pending_signature', 'fulfilled', 'disputed', 'terminated', 'expired', 'amended'));

-- 2. New columns on contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS contract_type text DEFAULT 'commerce';
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS principal_wallet text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS agent_wallet text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS ipfs_cid text;

CREATE INDEX IF NOT EXISTS idx_contracts_principal_wallet ON public.contracts(principal_wallet);
CREATE INDEX IF NOT EXISTS idx_contracts_agent_wallet ON public.contracts(agent_wallet);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON public.contracts(created_at DESC);

-- 3. Signatures table
CREATE TABLE IF NOT EXISTS public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) NOT NULL,
  signer_wallet text NOT NULL,
  signature text NOT NULL,
  message_hash text NOT NULL,
  signed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_contract ON public.signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer ON public.signatures(signer_wallet);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- Anyone can read signatures (public verification)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'signatures' AND policyname = 'Public can read signatures') THEN
    CREATE POLICY "Public can read signatures" ON public.signatures FOR SELECT USING (true);
  END IF;
END $$;

-- 4. Audit log (append-only)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id),
  action text NOT NULL,
  actor text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_contract ON public.audit_log(contract_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Anyone can read audit log entries (transparency)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'Public can read audit log') THEN
    CREATE POLICY "Public can read audit log" ON public.audit_log FOR SELECT USING (true);
  END IF;
END $$;

-- 5. Status transition trigger
CREATE OR REPLACE FUNCTION public.enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- draft can only go to pending_signature
  IF OLD.status = 'draft' AND NEW.status NOT IN ('pending_signature') THEN
    RAISE EXCEPTION 'Invalid transition from draft to %', NEW.status;
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

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS check_status_transition ON public.contracts;
CREATE TRIGGER check_status_transition
  BEFORE UPDATE OF status ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_status_transition();
