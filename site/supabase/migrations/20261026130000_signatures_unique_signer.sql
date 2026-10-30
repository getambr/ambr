-- One signature per wallet per contract.
--
-- The sign route checks "has this wallet signed?" and then inserts; two
-- simultaneous requests from one wallet could both pass the check. The route
-- now treats a unique violation (23505) as 409 already_signed, and the status
-- of a contract is computed from the signatures on file, so a duplicate row
-- would also be double-counted by anything that counts rows.
--
-- NOT YET APPLIED. Before running, make sure no duplicates exist (the index
-- creation fails otherwise):
--   SELECT contract_id, lower(signer_wallet), count(*) FROM public.signatures
--   GROUP BY 1, 2 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS signatures_contract_signer_unique
  ON public.signatures (contract_id, lower(signer_wallet));
