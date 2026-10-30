-- Honest signature level.
--
-- signatures.signature_level defaulted to 'advanced', so every wallet ECDSA
-- signature that carried no identity binding was recorded as an advanced
-- electronic signature. A wallet signature on its own is 'simple'. The sign
-- route now sets the level explicitly on insert ('simple', or 'advanced' only
-- when a verified ZK identity attestation is stored in signer_identity).
--
-- NOT YET APPLIED. Review before running against any database.

-- 1. Correct existing rows that got the default without an identity binding.
UPDATE public.signatures
SET signature_level = 'simple'
WHERE signature_level = 'advanced'
  AND signer_identity IS NULL;

-- 2. Make the default honest so a future insert that forgets the column does
--    not claim more than it has.
ALTER TABLE public.signatures
  ALTER COLUMN signature_level SET DEFAULT 'simple';
