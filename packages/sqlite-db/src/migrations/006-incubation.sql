-- 006-incubation: incubation items, research runs, and proposals.
-- See docs/spec/incubation.md for the full object model.

-- incubation_items: root object for incubation work.
CREATE TABLE IF NOT EXISTS incubation_items (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL CHECK (scope IN ('global', 'project', 'candidate_project')),
  project_id   TEXT,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'paused', 'promoted', 'discarded')),
  proposal_id  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES incubation_proposals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incubation_items_scope       ON incubation_items(scope);
CREATE INDEX IF NOT EXISTS idx_incubation_items_project_id  ON incubation_items(project_id);
CREATE INDEX IF NOT EXISTS idx_incubation_items_status       ON incubation_items(status);

-- research_runs: background research jobs attached to an incubation item.
CREATE TABLE IF NOT EXISTS research_runs (
  id                  TEXT PRIMARY KEY,
  incubation_item_id  TEXT NOT NULL,
  mode                TEXT NOT NULL
                       CHECK (mode IN ('source_synthesis', 'monitor_tick', 'outreach_analysis', 'experiment_loop')),
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  plan                TEXT NOT NULL DEFAULT '[]',   -- JSON: ResearchSourcePlan[]
  results             TEXT,                         -- JSON: unknown
  started_at          TEXT,
  completed_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (incubation_item_id) REFERENCES incubation_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_runs_incubation_item_id ON research_runs(incubation_item_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_status             ON research_runs(status);

-- incubation_proposals: synthesized proposals derived from incubation items.
CREATE TABLE IF NOT EXISTS incubation_proposals (
  id                  TEXT PRIMARY KEY,
  incubation_item_id  TEXT NOT NULL,
  kind                TEXT NOT NULL
                       CHECK (kind IN ('setup_candidate', 'spec_change', 'epic', 'story', 'steering', 'decision_record', 'discard')),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  promotion_target    TEXT CHECK (promotion_target IN ('backlog', 'sprint', 'spec', 'architecture', 'workflow')),
  promotion_ref       TEXT,                         -- JSON: PromotionRef
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (incubation_item_id) REFERENCES incubation_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_incubation_proposals_incubation_item_id ON incubation_proposals(incubation_item_id);