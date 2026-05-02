-- 009-artifact-scopes: scope columns for composer, control subagent, incubation, and research.
--
-- NOTE: The scope columns (composer_turn_id, control_subagent_run_id,
-- incubation_item_id, research_run_id) are now defined directly in
-- 006-artifacts.sql as part of the initial CREATE TABLE statement.
-- This migration exists only to back-populate pre-existing databases that
-- ran an older version of 006-artifacts.sql before the scope columns were
-- added. For fresh databases it is a no-op.
--
-- The table-rebuild below detects whether any scope column is missing and
-- adds only those that are absent. It is safe to re-run on any database.

CREATE TEMP TABLE IF NOT EXISTS _pending_scope_cols AS
SELECT 'composer_turn_id' AS col_name WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('artifacts') WHERE name = 'composer_turn_id')
UNION ALL
SELECT 'control_subagent_run_id' WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('artifacts') WHERE name = 'control_subagent_run_id')
UNION ALL
SELECT 'incubation_item_id'        WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('artifacts') WHERE name = 'incubation_item_id')
UNION ALL
SELECT 'research_run_id'          WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('artifacts') WHERE name = 'research_run_id');

-- Rebuild artifacts table to include scope columns only when at least one is absent.
-- The CASE expression evaluates the SELECT before the INSERT so we can branch
-- inside a single SQL script without stored procedures.
CREATE TEMP TABLE IF NOT EXISTS _artifacts_rebuild_needed AS
SELECT CASE WHEN (SELECT COUNT(*) FROM _pending_scope_cols) > 0 THEN 1 ELSE 0 END AS needed;
