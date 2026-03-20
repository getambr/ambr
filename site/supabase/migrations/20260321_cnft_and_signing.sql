-- cNFT minting columns + fix status transition trigger
-- Additive changes only

-- 1. Add NFT tracking columns to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS nft_token_id INTEGER;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS nft_tx_hash TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS nft_minted_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS nft_mint_status TEXT DEFAULT NULL
  CHECK (nft_mint_status IS NULL OR nft_mint_status IN ('pending', 'minted', 'failed'));

CREATE INDEX IF NOT EXISTS idx_contracts_nft_token ON contracts(nft_token_id) WHERE nft_token_id IS NOT NULL;

-- 2. Fix status transition trigger: add handshake transitions
CREATE OR REPLACE FUNCTION public.enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- draft can go to handshake or pending_signature
  IF OLD.status = 'draft' AND NEW.status NOT IN ('handshake', 'pending_signature') THEN
    RAISE EXCEPTION 'Invalid transition from draft to %', NEW.status;
  END IF;
  -- handshake can go to pending_signature
  IF OLD.status = 'handshake' AND NEW.status NOT IN ('pending_signature') THEN
    RAISE EXCEPTION 'Invalid transition from handshake to %', NEW.status;
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

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
