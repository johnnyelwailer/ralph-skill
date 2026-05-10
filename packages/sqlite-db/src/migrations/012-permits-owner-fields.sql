-- 012-permits-owner-fields: extend permits table to support non-session permit owners.
-- The API spec allows research_run_id, composer_turn_id, and control_subagent_run_id
-- as alternative owners to session_id. These columns are nullable; exactly one owner
-- field is populated per permit.
--
-- Note: composer_turn_id and control_subagent_run_id were already added in 004-permits
-- which created the permits table with those columns. Only research_run_id is new here.

ALTER TABLE permits ADD COLUMN research_run_id TEXT;
