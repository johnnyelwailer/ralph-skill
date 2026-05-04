-- 016-composer-turns: composer turn registry.
-- See docs/spec/api.md §Composer.

CREATE TABLE IF NOT EXISTS composer_turns (
  id                          TEXT PRIMARY KEY,
  -- Input fields
  scope_kind                  TEXT NOT NULL,
  scope_id                    TEXT,
  message                     TEXT NOT NULL DEFAULT '',
  artifact_refs               TEXT NOT NULL DEFAULT '[]',   -- JSON array
  media_inputs                TEXT NOT NULL DEFAULT '[]',   -- JSON array
  context_refs                TEXT NOT NULL DEFAULT '[]',   -- JSON array
  intent_hint                 TEXT,
  allowed_action_classes      TEXT NOT NULL DEFAULT '[]',   -- JSON array
  delegation_policy            TEXT NOT NULL DEFAULT '{}',  -- JSON object
  provider_chain              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  transcription               TEXT NOT NULL DEFAULT '{}',  -- JSON object
  max_cost_usd                REAL,
  approval_policy             TEXT NOT NULL DEFAULT 'preview_required',
  -- Response-only fields (set on create/update)
  status                      TEXT NOT NULL DEFAULT 'queued'
                                 CHECK (status IN (
                                   'queued','running','waiting_for_approval',
                                   'completed','failed','cancelled'
                                 )),
  media_mode                  TEXT NOT NULL DEFAULT 'none'
                                 CHECK (media_mode IN ('native','derived','none')),
  voice_mode                  TEXT NOT NULL DEFAULT 'none'
                                 CHECK (voice_mode IN ('native','transcribed','client_transcribed','none')),
  delegated_refs              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  launched_refs               TEXT NOT NULL DEFAULT '[]',  -- JSON array
  proposed_actions            TEXT NOT NULL DEFAULT '[]',  -- JSON array
  proposal_refs               TEXT NOT NULL DEFAULT '[]',  -- JSON array
  usage_tokens_in             INTEGER NOT NULL DEFAULT 0,
  usage_tokens_out            INTEGER NOT NULL DEFAULT 0,
  usage_cost_usd              REAL NOT NULL DEFAULT 0,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_composer_turns_status
  ON composer_turns(status);
CREATE INDEX IF NOT EXISTS idx_composer_turns_scope
  ON composer_turns(scope_kind, scope_id);
CREATE INDEX IF NOT EXISTS idx_composer_turns_created
  ON composer_turns(created_at);
