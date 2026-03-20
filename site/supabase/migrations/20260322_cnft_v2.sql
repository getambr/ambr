-- cNFT v2: counterparty tracking + visibility negotiation

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS nft_counterparty_wallet TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS nft_holder_wallet TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_nft_counterparty
  ON contracts(nft_counterparty_wallet) WHERE nft_counterparty_wallet IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_nft_holder
  ON contracts(nft_holder_wallet) WHERE nft_holder_wallet IS NOT NULL;

ALTER TABLE handshakes ADD COLUMN IF NOT EXISTS visibility_preference TEXT
  CHECK (visibility_preference IS NULL OR visibility_preference IN
    ('private', 'metadata_only', 'public', 'encrypted'));
