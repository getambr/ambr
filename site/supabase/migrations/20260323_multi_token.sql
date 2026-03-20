-- Add token_symbol to x402_payments to track which stablecoin was used
ALTER TABLE x402_payments ADD COLUMN IF NOT EXISTS token_symbol TEXT DEFAULT 'USDC';

-- Rename amount_usdc to amount_usd for clarity (it now stores normalized USD value)
-- Keep amount_usdc as-is for backward compat, just add a comment
COMMENT ON COLUMN x402_payments.amount_usdc IS 'Normalized USD value of payment (regardless of token used)';
COMMENT ON COLUMN x402_payments.token_symbol IS 'ERC-20 token symbol used for payment (USDC, USDbC, DAI)';
