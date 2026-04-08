-- Q1 follow-up: allow amendments to change contract visibility.
--
-- Previously the approve route inherited the parent contract's visibility
-- on the new amendment. This migration adds a column on amendment_proposals
-- so the proposer can request a visibility change as part of the amendment,
-- and the counterparty sees it before approving.
--
-- Allowed values match the existing contracts.visibility column:
--   private          - default, no public access without share token
--   metadata_only    - hash + metadata visible, full text gated
--   public           - full text visible to anyone with the hash
--   encrypted        - full text encrypted at rest, key holders only
--
-- NULL means "no visibility change requested" — inherit from parent (existing
-- behavior). Existing rows are unaffected.
--
-- Migration target: xoepsyapvuzijuyrvmbz (Amber Protocol production)

ALTER TABLE public.amendment_proposals
  ADD COLUMN IF NOT EXISTS proposed_visibility text
    CHECK (proposed_visibility IS NULL OR proposed_visibility IN
      ('private', 'metadata_only', 'public', 'encrypted'));

COMMENT ON COLUMN public.amendment_proposals.proposed_visibility IS
  'Optional visibility change requested by the proposer. NULL means inherit '
  'from parent contract. Public→private is honored but cannot recall existing '
  'cached/distributed copies — UI should warn the counterparty before approval.';
