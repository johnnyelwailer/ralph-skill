-- 010-proposal-state: proposal lifecycle state machine.
-- See docs/spec/incubation.md §Synthesis and proposals and api.md §Proposals.
-- States: draft -> ready -> applied|rejected

ALTER TABLE incubation_proposals
  ADD COLUMN state TEXT NOT NULL DEFAULT 'draft'
  CHECK (state IN ('draft', 'ready', 'applied', 'rejected'));

-- Track promoted_refs on incubation_items so the item records what it became.
ALTER TABLE incubation_items
  ADD COLUMN promoted_refs TEXT NOT NULL DEFAULT '[]';  -- JSON: PromotionRef[]
