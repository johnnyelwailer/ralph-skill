-- 019-drop-composer-review-refs: remove promotion-specific composer lane.
--
-- Promotion previews are ordinary artifacts/profile data and proposed actions.
-- Composer turns keep launched_refs and proposed_actions, not a separate
-- promotion list.

CREATE TABLE IF NOT EXISTS composer_turns_v2 (
  id                          TEXT PRIMARY KEY,
  scope_kind                  TEXT NOT NULL,
  scope_id                    TEXT,
  message                     TEXT NOT NULL DEFAULT '',
  artifact_refs               TEXT NOT NULL DEFAULT '[]',
  media_inputs                TEXT NOT NULL DEFAULT '[]',
  context_refs                TEXT NOT NULL DEFAULT '[]',
  intent_hint                 TEXT,
  allowed_action_classes      TEXT NOT NULL DEFAULT '[]',
  delegation_policy           TEXT NOT NULL DEFAULT '{}',
  provider_chain              TEXT NOT NULL DEFAULT '[]',
  transcription               TEXT NOT NULL DEFAULT '{}',
  max_cost_usd                REAL,
  approval_policy             TEXT NOT NULL DEFAULT 'preview_required',
  status                      TEXT NOT NULL DEFAULT 'queued'
                                 CHECK (status IN (
                                   'queued','running','waiting_for_approval',
                                   'completed','failed','cancelled'
                                 )),
  media_mode                  TEXT NOT NULL DEFAULT 'none'
                                 CHECK (media_mode IN ('native','derived','none')),
  voice_mode                  TEXT NOT NULL DEFAULT 'none'
                                 CHECK (voice_mode IN ('native','transcribed','client_transcribed','none')),
  delegated_refs              TEXT NOT NULL DEFAULT '[]',
  launched_refs               TEXT NOT NULL DEFAULT '[]',
  proposed_actions            TEXT NOT NULL DEFAULT '[]',
  usage_tokens_in             INTEGER NOT NULL DEFAULT 0,
  usage_tokens_out            INTEGER NOT NULL DEFAULT 0,
  usage_cost_usd              REAL NOT NULL DEFAULT 0,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

INSERT OR REPLACE INTO composer_turns_v2 (
  id,
  scope_kind,
  scope_id,
  message,
  artifact_refs,
  media_inputs,
  context_refs,
  intent_hint,
  allowed_action_classes,
  delegation_policy,
  provider_chain,
  transcription,
  max_cost_usd,
  approval_policy,
  status,
  media_mode,
  voice_mode,
  delegated_refs,
  launched_refs,
  proposed_actions,
  usage_tokens_in,
  usage_tokens_out,
  usage_cost_usd,
  created_at,
  updated_at
)
SELECT
  id,
  scope_kind,
  scope_id,
  message,
  artifact_refs,
  media_inputs,
  context_refs,
  intent_hint,
  allowed_action_classes,
  delegation_policy,
  provider_chain,
  transcription,
  max_cost_usd,
  approval_policy,
  status,
  media_mode,
  voice_mode,
  delegated_refs,
  launched_refs,
  proposed_actions,
  usage_tokens_in,
  usage_tokens_out,
  usage_cost_usd,
  created_at,
  updated_at
FROM composer_turns;

DROP TABLE composer_turns;
ALTER TABLE composer_turns_v2 RENAME TO composer_turns;

CREATE INDEX IF NOT EXISTS idx_composer_turns_status
  ON composer_turns(status);
CREATE INDEX IF NOT EXISTS idx_composer_turns_scope
  ON composer_turns(scope_kind, scope_id);
CREATE INDEX IF NOT EXISTS idx_composer_turns_created
  ON composer_turns(created_at);
