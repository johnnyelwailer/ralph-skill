# Issue #198: CI: Add TypeScript type-checking job

Part of #22: Epic: Set up GitHub Actions CI

## Objective
Add a dedicated CI type-check gate that runs TypeScript validation for both the CLI package and the dashboard package so type regressions are caught in pull requests before merge.

## Architectural Context
- This change belongs to the repository CI orchestration layer (`.github/workflows/ci.yml`), not to runtime or inner-loop execution code.
- The workflow must invoke existing package-level contracts:
  - `aloop/cli/package.json` -> `npm run type-check` (`tsc --noEmit`)
  - `aloop/cli/dashboard/package.json` -> `npm run type-check` (`tsc --noEmit`)
- TypeScript configuration already exists in both packages (`aloop/cli/tsconfig.json`, `aloop/cli/dashboard/tsconfig.json`), so this issue is about wiring CI execution, not introducing new compiler settings.

## Scope
- In scope for modification:
  - `.github/workflows/ci.yml`
- Allowed implementation shape:
  - One `type-check` job with sequential CLI + dashboard type-check steps, or
  - Two jobs (CLI/dashboard) under the same workflow
- Job runtime requirements:
  - `runs-on: ubuntu-latest`
  - `actions/setup-node@v4` with Node `22`

## Out of Scope
- Do not modify TypeScript source files under `aloop/cli/src/**` or `aloop/cli/dashboard/src/**`; this issue adds CI coverage only (Constitution #12, #19).
- Do not modify loop runtime boundaries (`aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, orchestrator/runtime logic) since this is a workflow configuration task (Constitution #1, #2).
- Do not change package scripts or tsconfig unless a blocker is discovered and explicitly raised in a follow-up issue (Constitution #18, #21).

## Constraints
- Keep the change limited to this one concern: adding type-check CI coverage (Constitution #12).
- Respect file ownership and stated scope; avoid opportunistic workflow refactors unrelated to type-checking (Constitution #18, #19).
- Use existing `npm run type-check` scripts as the interface contract rather than duplicating raw compiler commands in multiple places.
- Keep workflow behavior deterministic on GitHub-hosted Linux runners (`ubuntu-latest`, Node 22).

## Deliverables
- New `type-check` job in `.github/workflows/ci.yml`
- Runs type-checking for both CLI and dashboard packages
- Can be a single job with two sequential steps, or two parallel jobs

## Acceptance Criteria
- [ ] `.github/workflows/ci.yml` defines a CI job named `type-check` (or functionally equivalent CLI/dashboard split jobs) dedicated to TypeScript type checking.
- [ ] The type-check path executes `npm run type-check` in `aloop/cli/` and exits successfully.
- [ ] The type-check path executes `npm run type-check` in `aloop/cli/dashboard/` and exits successfully.
- [ ] The workflow configuration for type-checking uses `runs-on: ubuntu-latest`.
- [ ] The workflow configuration for type-checking uses `actions/setup-node@v4` with Node `22`.
- [ ] Existing dashboard unit test job behavior is unchanged except for any minimal wiring required to coexist with the new type-check job.

## Files
- `.github/workflows/ci.yml`

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
