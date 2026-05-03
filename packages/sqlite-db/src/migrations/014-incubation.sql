-- 014-incubation: incubation registry tables.
-- See docs/spec/incubation.md §Object model.
-- The daemon owns all objects; all state changes emit events.

CREATE TABLE IF NOT EXISTS incubation_items (
  id                  TEXT PRIMARY KEY,
  scope_kind          TEXT NOT NULL CHECK (scope_kind IN ('global', 'project', 'candidate_project')),
  scope_project_id    TEXT,
  scope_abs_path     TEXT,
  scope_repo_url     TEXT,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL DEFAULT '',
  state               TEXT NOT NULL DEFAULT 'captured'
                       CHECK (state IN (
                         'captured','clarifying','researching','synthesized',
                         'ready_for_promotion','promoted','discarded','archived'
                       )),
  labels              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  priority            TEXT CHECK (priority IN ('low','normal','high')),
  source_client       TEXT NOT NULL,
  source_captured_at  TEXT NOT NULL,
  source_author       TEXT,
  source_url          TEXT,
  links_project_id         TEXT,
  links_artifact_ids       TEXT NOT NULL DEFAULT '[]',  -- JSON array
  links_related_item_ids   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  links_promoted_refs      TEXT NOT NULL DEFAULT '[]',  -- JSON array
  metadata            TEXT NOT NULL DEFAULT '{}',  -- JSON object
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incubation_items_state    ON incubation_items(state);
CREATE INDEX IF NOT EXISTS idx_incubation_items_project  ON incubation_items(links_project_id);
CREATE INDEX IF NOT EXISTS idx_incubation_items_scope    ON incubation_items(scope_kind, scope_project_id);

-- Research runs: daemon-owned background jobs tied to an incubation item.
CREATE TABLE IF NOT EXISTS research_runs (
  id                  TEXT PRIMARY KEY,
  item_id             TEXT NOT NULL REFERENCES incubation_items(id) ON DELETE CASCADE,
  project_id          TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','paused','completed','failed','cancelled')),
  mode                TEXT NOT NULL
                       CHECK (mode IN ('source_synthesis','monitor_tick','outreach_analysis','experiment_loop')),
  phase               TEXT CHECK (phase IN (
                         'planning','question_development','source_acquisition',
                         'experimenting','synthesizing','reporting'
                       )),
  question            TEXT NOT NULL,
  provider_chain      TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source_plan         TEXT,                        -- JSON object or NULL
  experiment_plan     TEXT,                        -- JSON object or NULL
  monitor_id          TEXT REFERENCES research_monitors(id) ON DELETE SET NULL,
  cost_usd            REAL NOT NULL DEFAULT 0,
  tokens_in           INTEGER NOT NULL DEFAULT 0,
  tokens_out          INTEGER NOT NULL DEFAULT 0,
  artifact_ids        TEXT NOT NULL DEFAULT '[]',  -- JSON array
  findings_summary    TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  ended_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_runs_item    ON research_runs(item_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);

-- Research monitors: scheduled research programs tied to an incubation item.
CREATE TABLE IF NOT EXISTS research_monitors (
  id                  TEXT PRIMARY KEY,
  item_id             TEXT NOT NULL REFERENCES incubation_items(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','paused','completed','failed','cancelled')),
  cadence_kind        TEXT NOT NULL CHECK (cadence_kind IN ('hourly','daily','weekly','monthly','cron')),
  cadence_cron        TEXT,                        -- present when cadence_kind = 'cron'
  event_triggers      TEXT NOT NULL DEFAULT '[]',  -- JSON array
  question            TEXT NOT NULL,
  source_plan         TEXT NOT NULL,               -- JSON object (ResearchSourcePlan)
  synthesis_policy    TEXT NOT NULL,               -- JSON object
  next_run_at         TEXT NOT NULL,
  last_run_at         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_monitors_item   ON research_monitors(item_id);
CREATE INDEX IF NOT EXISTS idx_research_monitors_status ON research_monitors(status);

-- Outreach plans: governed survey/interview workflows.
CREATE TABLE IF NOT EXISTS outreach_plans (
  id                             TEXT PRIMARY KEY,
  item_id                        TEXT NOT NULL REFERENCES incubation_items(id) ON DELETE CASCADE,
  kind                           TEXT NOT NULL
                                  CHECK (kind IN ('survey_plan','interview_plan','outreach_message','response_analysis')),
  state                          TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (state IN ('draft','ready_for_approval','approved','collecting','completed','cancelled')),
  title                          TEXT NOT NULL,
  target_audience                TEXT NOT NULL,
  draft                          TEXT NOT NULL DEFAULT '',
  consent_text                   TEXT,
  personal_data_classification   TEXT NOT NULL DEFAULT 'none'
                                  CHECK (personal_data_classification IN ('none','public','private','sensitive','anonymous')),
  send_mode                      TEXT NOT NULL DEFAULT 'manual_export'
                                  CHECK (send_mode IN ('manual_export','adapter_send')),
  approved_snapshot_id           TEXT,
  artifact_ids                   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at                     TEXT NOT NULL,
  updated_at                     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_plans_item   ON outreach_plans(item_id);
CREATE INDEX IF NOT EXISTS idx_outreach_plans_state ON outreach_plans(state);

-- Incubation proposals: synthesis output reviewable before promotion.
CREATE TABLE IF NOT EXISTS incubation_proposals (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES incubation_items(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
                  CHECK (kind IN (
                    'setup_candidate','spec_change','epic','story',
                    'steering','decision_record','discard'
                  )),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  rationale       TEXT NOT NULL DEFAULT '',
  evidence_refs   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  target          TEXT,                          -- JSON object or NULL (PromotionTarget)
  state           TEXT NOT NULL DEFAULT 'draft'
                  CHECK (state IN ('draft','ready','applied','rejected')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incubation_proposals_item  ON incubation_proposals(item_id);
CREATE INDEX IF NOT EXISTS idx_incubation_proposals_state ON incubation_proposals(state);
