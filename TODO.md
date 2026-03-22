# TODO — Issue #181: Self-healing

## Current Phase: Bug fixes (QA + Review consolidated)

### In Progress

### Up Next

- [x] **Extract shared `runGh` helper** — The duplicated `runGh` closures in `deriveFilterRepo` and `deriveTrunkBranch` were replaced by shared `runGhWithFallback` helper to eliminate duplication while preserving behavior/logging. (priority: medium) [review Gate 4]

### Completed

- [x] **Fix `deriveFilterRepo` env var fallback** — Removed `&& ghHost` guard so `GITHUB_REPOSITORY` is used unconditionally. Added test with only `GITHUB_REPOSITORY` set (no `GH_HOST`). (priority: high) [qa/P1 + review Gate 1 + review Gate 2]

- [x] **Implement startup health checks in `session-health.json`** — Added `runStartupHealthChecks` function that runs `gh auth status`, `gh repo view`, and `git status --porcelain` checks. All results (labels + startup checks) now written to `session-health.json`. (priority: high) [qa/P1 + review Gate 1]

- [x] **Implement `ALERT.md` on critical startup failures** — When `gh auth status` fails (critical check), writes `ALERT.md` with error details and throws with non-zero exit. `gh repo view` failure is non-critical since repo may not be configured yet. (priority: high) [qa/P1 + review Gate 1]

---

## Spec-Gap Analysis (2026-03-22)

### Findings

- [ ] **[spec-gap] SPEC.md missing orchestrator startup self-healing behaviors** — The code implements three self-healing features not documented in SPEC.md acceptance criteria: (1) `session-health.json` startup health checks (`gh auth status`, `gh repo view`, `git status --porcelain`) at `orchestrate.ts:1284-1347`, (2) `ALERT.md` creation on critical failures at `orchestrate.ts:1739-1757`, (3) `ensureLabels` label self-healing at `orchestrate.ts:1213-1260`. SPEC.md's orchestrator acceptance criteria (lines 2183-2229) don't mention startup validation or label bootstrapping. **Suggested fix:** Add acceptance criteria to SPEC.md under the orchestrator section covering startup health checks, ALERT.md on critical failure, and label self-healing. (priority: P2 — correctness drift, code ahead of spec)

### No Issues Found

- Config completeness: all 5 providers + round-robin consistent across `config.yml`, `start.ts`, loop scripts
- Model IDs current (last updated 2026-03-19), `start.ts` DEFAULT_MODELS match `config.yml`
- Template frontmatter: all loop templates use `provider: claude`; orchestrator templates correctly omit provider (runtime-provided)
- No orphan templates; all referenced templates exist
- Provider validation sets consistent across `start.ts` PROVIDER_SET and loop scripts
- TODO hygiene: all 4 items marked done, no stale or hallucinated items
- No previously filed `[spec-gap]` items to resolve
