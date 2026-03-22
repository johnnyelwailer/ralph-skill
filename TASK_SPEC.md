# Sub-Spec: Issue #181 — Self-healing: auto-create missing labels and derive missing config

Part of #26: Epic: Orchestrator Core — Autonomous Lifecycle & Request Processing

## Objective

Implement self-healing behaviors so the orchestrator recovers from common configuration issues without human intervention.

## Context

The orchestrator expects certain GitHub labels (e.g., `aloop/auto`, `aloop/epic`, `aloop/sub-issue`, `aloop/needs-refine`) and config values (repo, trunk branch, project number) to exist. When they're missing, operations silently fail or produce confusing errors.

## Deliverables

### Label self-healing
- At orchestrator startup (in `orchestrateCommandWithDeps`), check if required labels exist:
  - `aloop/auto`, `aloop/epic`, `aloop/sub-issue`, `aloop/needs-refine`, `aloop/needs-review`, `aloop/in-progress`, `aloop/done`
- If any are missing, create them via `gh label create` with appropriate colors
- Run this check once at startup and cache the result in session state
- If label creation fails (permissions), log warning but don't block orchestration

### Config derivation from meta.json
- If `state.filter_repo` is null but meta.json has `repo` or `project_root`, derive repo from `gh repo view --json nameWithOwner`
- If `state.trunk_branch` is default but repo has a different default branch, detect and use it
- If `gh_project_number` is not set, attempt dynamic discovery (already partially implemented — verify it works)

### Missing config recovery
- If `meta.json` is missing critical fields, attempt to reconstruct from:
  - Git remote URL → repo slug
  - `orchestrator.json` state → spec file, trunk branch
  - Environment variables → `GH_HOST`, `GITHUB_REPOSITORY`
- Log all derivations so the user can verify correctness

### Startup health check
- Before entering scan loop, run a quick health check:
  - `gh auth status` → verify authenticated
  - `gh repo view` → verify repo access
  - `git status` → verify clean worktree
  - Write results to `session-health.json`
- If critical checks fail, write `ALERT.md` and exit with clear error

## Acceptance Criteria

- [ ] Missing labels auto-created at startup
- [ ] Missing repo config derived from git remote / meta.json
- [ ] Missing trunk branch derived from repo default branch
- [ ] Startup health check verifies gh auth, repo access, git state
- [ ] `session-health.json` written with check results
- [ ] All derivations logged for transparency
- [ ] Graceful degradation: missing optional config doesn't block operation

## File Scope
- `aloop/cli/src/commands/orchestrate.ts` (modify — startup sequence)
- `aloop/cli/src/commands/orchestrate.test.ts` (add tests)
