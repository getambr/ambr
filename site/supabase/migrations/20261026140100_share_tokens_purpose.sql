-- What a share token is for.
--
-- Contract creation hands the deployer a 30-day full-access token in their
-- reader link, so their own reader URL works. That token is for viewing. The
-- sign route lets a full-access token fill an open counterparty slot (the
-- invite the creator sends from POST /share), so without a purpose the
-- deployer's token doubled as an invite and a creator who could not prove
-- themselves was quietly placed as the counterparty.
--
--   deployer  the creation-time link; opens the reader, signs nothing
--   invite    made by POST /share; the only kind that can fill a counterparty slot
--
-- The default is 'deployer' on purpose: every token that exists today stops
-- counting as an invite, and only a token made by /share from now on does.
--
-- Applied to production 27.10.2026, before the code that inserts `purpose` was deployed.
-- until the column exists, creating a share token fails.

ALTER TABLE public.share_tokens
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'deployer'
  CHECK (purpose IN ('deployer', 'invite'));
