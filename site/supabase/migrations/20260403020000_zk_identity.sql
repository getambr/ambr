-- P1.5: ZK Identity — DemosSDK Groth16/Poseidon integration
-- Nullifier tracking prevents proof replay attacks

CREATE TABLE IF NOT EXISTS public.identity_nullifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nullifier_hash text UNIQUE NOT NULL,
  wallet_address text NOT NULL,
  contract_id uuid REFERENCES public.contracts(id),
  provider text NOT NULL DEFAULT 'demos',
  merkle_root text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nullifiers_hash ON public.identity_nullifiers(nullifier_hash);
CREATE INDEX IF NOT EXISTS idx_nullifiers_wallet ON public.identity_nullifiers(wallet_address);

ALTER TABLE public.identity_nullifiers ENABLE ROW LEVEL SECURITY;

-- Contract-level ZK requirement flag
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS require_zk_identity boolean DEFAULT false;

-- Index for queries filtering by ZK requirement
CREATE INDEX IF NOT EXISTS idx_contracts_zk_identity
  ON public.contracts(require_zk_identity) WHERE require_zk_identity = true;
