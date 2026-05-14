-- 035-artifacts-incubation: add incubation metadata column to artifacts.
-- Spec: docs/spec/api.md §Incubation + docs/spec/incubation.md §Metadata Profile
--
-- Incubation metadata is stored as a JSON blob on the artifact record.
-- Clients and projectors use it to build incubation inbox/board views.
-- The column is nullable — artifacts without incubation metadata have null.

ALTER TABLE artifacts ADD COLUMN incubation TEXT;