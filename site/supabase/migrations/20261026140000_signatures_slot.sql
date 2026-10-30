-- Which side of the contract a signature fills.
--
-- A signature row said who signed, not as whom. With a slot that no declared
-- wallet names ("open"), the sign route gates who may fill it (the creator for
-- the principal side, an invite holder for the counterparty side), but it
-- decided "is this side still free?" from a SELECT before the INSERT. Two
-- requests from one invite holder's two wallets both saw it free, both passed,
-- and the contract counted them as principal and counterparty and activated
-- without the creator.
--
-- The unique index makes the slot a fact the database enforces: the second
-- insert for a slot fails with 23505 on signatures_contract_slot_uniq and the
-- route answers 409 slot_taken. The route writes the slot with every new row and
-- reads it back to count which side each signature fills.
--
-- NULL for rows from before this migration: they stay unlabelled and are matched
-- to a side by who fits it, as validity always did. The partial index ignores
-- them, so no backfill and no duplicate check is needed.
--
-- Applied to production 27.10.2026, before the code that inserts `slot` was deployed. Until
-- the column exists that insert fails and every signature is refused.

ALTER TABLE public.signatures
  ADD COLUMN IF NOT EXISTS slot text CHECK (slot IN ('principal', 'counterparty'));

CREATE UNIQUE INDEX IF NOT EXISTS signatures_contract_slot_uniq
  ON public.signatures (contract_id, slot)
  WHERE slot IS NOT NULL;
