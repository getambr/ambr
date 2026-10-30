-- x402 v2: payments settle through a facilitator, so a row now records the
-- CAIP-2 network, the resource that was paid for and the protocol version.
-- Existing rows (raw-tx-hash era) keep NULLs here.
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS resource TEXT;
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS x402_version SMALLINT;

COMMENT ON COLUMN x402_payments.network IS 'CAIP-2 network the payment settled on, e.g. eip155:8453';
COMMENT ON COLUMN x402_payments.resource IS 'URL of the resource that was paid for';
COMMENT ON COLUMN x402_payments.x402_version IS 'x402 protocol version of the payment payload (2 for facilitator-settled payments)';
