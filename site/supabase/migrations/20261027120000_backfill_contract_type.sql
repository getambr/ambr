-- contracts.contract_type holds the template's category.
--
-- The column came with DEFAULT 'commerce' (20260311000000_schema_v2.sql) and
-- no code wrote it, so every contract read 'commerce', the consumer (A1) and
-- delegation (D1, D2, P2) ones included. storeContract now writes
-- templates.category at creation; this gives the rows created before it the
-- same value.
--
--   consumer    A1, A2, A3
--   commerce    C1, C2, C3
--   delegation  D1, D2, D3, P2
--
-- Sets contract_type only. check_status_transition fires on UPDATE OF status,
-- so it does not run and updated_at stays as it is; the awaiting-approval
-- trigger lets through any update that keeps the status. Safe to re-run.

UPDATE public.contracts c
SET contract_type = t.category
FROM public.templates t
WHERE t.id = c.template_id
  AND c.contract_type IS DISTINCT FROM t.category;
