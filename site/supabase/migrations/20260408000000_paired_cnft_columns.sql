-- Phase 1: Paired cNFT minting
--
-- Previously contracts got a single NFT minted to one wallet (first signer
-- or x402 payer). The counterparty was recorded on-chain as metadata only
-- and held no token in their wallet. This migration adds columns to track a
-- second, paired NFT mint so both parties hold equal on-chain proof of
-- participation.
--
-- The existing cNFT smart contract ABI already supports this workflow via
-- two `mint()` calls with the addresses swapped. No contract redeployment.
--
-- Migration target: xoepsyapvuzijuyrvmbz (Amber Protocol production)

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS nft_counterparty_token_id bigint,
  ADD COLUMN IF NOT EXISTS nft_counterparty_tx_hash text;

COMMENT ON COLUMN public.contracts.nft_counterparty_token_id IS
  'Token ID of the paired NFT minted to the counterparty wallet. NULL when '
  'the contract is single-party (no counterparty) or when the paired mint '
  'call failed (see audit_log for details).';

COMMENT ON COLUMN public.contracts.nft_counterparty_tx_hash IS
  'Transaction hash of the second mint() call that placed the paired NFT '
  'in the counterparty wallet.';
