-- Phase 2: Bilateral amendment proposal workflow
--
-- Previously `/api/v1/contracts/[id]/amend` unilaterally generated a new
-- amendment contract and flipped the original to status='amended' with no
-- counterparty approval. This migration adds the amendment_proposals table
-- that holds pending proposals until the counterparty explicitly approves
-- (or rejects) them.
--
-- Flow:
--   1. Proposer POSTs /amend → creates amendment_proposals row in 'pending'
--      state, original contract stays 'active'
--   2. Counterparty GETs /amendments → sees pending proposal
--   3. Counterparty POSTs /amendments/[id]/approve or /reject
--   4. On approve: amendment contract is generated + stored, original flips
--      to 'amended', paired cNFTs minted, proposal moves to 'approved'
--   5. On reject: proposal moves to 'rejected', original stays 'active'
--
-- EU AI Act Article 14 hook: if the proposed amendment's spending delta
-- exceeds original.oversight_threshold_usd, the approval endpoint forces
-- escalation to the human principal (status='escalated') regardless of
-- whether the approver holds a delegated agent key.
--
-- Migration target: xoepsyapvuzijuyrvmbz (Amber Protocol production)

CREATE TABLE IF NOT EXISTS public.amendment_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

  -- Who proposed the amendment
  proposer_wallet text NOT NULL,
  proposer_api_key_id uuid REFERENCES public.api_keys(id),

  -- What they proposed (parameters to re-run through the template)
  proposed_parameters jsonb NOT NULL,
  proposed_human_readable text,
  diff_summary text,

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'escalated')),

  -- Counterparty that must approve (the OTHER wallet in the contract)
  approval_required_from text NOT NULL,

  -- Approval tracking
  approved_by_wallet text,
  approved_at timestamptz,
  rejected_reason text,

  -- Optional expiry
  expires_at timestamptz,

  -- Once approved, points to the new amendment contract row in contracts
  resulting_contract_id uuid REFERENCES public.contracts(id),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amendment_proposals_contract
  ON public.amendment_proposals(original_contract_id);

CREATE INDEX IF NOT EXISTS idx_amendment_proposals_pending_for_wallet
  ON public.amendment_proposals(approval_required_from)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_amendment_proposals_proposer
  ON public.amendment_proposals(proposer_wallet);

ALTER TABLE public.amendment_proposals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.amendment_proposals IS
  'Pending amendment proposals awaiting counterparty approval. Implements '
  'the bilateral amendment workflow where either party can propose changes '
  'to an active contract but both must agree before the contract is updated.';
