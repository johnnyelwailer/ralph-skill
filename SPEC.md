# Issue #39: CI: Add loop shell script tests (bash)

## Issue #39: CI: Add loop shell script tests (bash)

## Objective
Add loop bash test execution to CI on `ubuntu-latest` so regressions in the shell runtime contract are caught in pull requests before merge.

## Architectural Context
- This issue changes the CI orchestration layer in `.github/workflows/ci.yml`.
- The tests live in `aloop/bin/*.tests.sh` and validate inner-loop shell behavior (`loop.sh`) from outside the runtime boundary.
- This is CI wiring only: it should add enforcement for existing shell tests without changing loop runtime behavior.

## Scope
- Modify `.github/workflows/ci.yml` to add a dedicated bash shell-test job (recommended name: `loop-shell-tests`) on `ubuntu-latest`.
- In that job, run bash tests directly with `bash <script>` for every `aloop/bin/*.tests.sh` file.
- Current bash test files to execute are:
  - `aloop/bin/loop_branch_coverage.tests.sh`
  - `aloop/bin/loop_finalizer_qa_coverage.tests.sh`
  - `aloop/bin/loop_json_escape.tests.sh`
  - `aloop/bin/loop_path_hardening.tests.sh`
  - `aloop/bin/loop_provenance.tests.sh`
  - `aloop/bin/loop_provider_health.tests.sh`
  - `aloop/bin/loop_provider_health_primitives.tests.sh`
- Ensure job prerequisites needed by these scripts are present (checkout + Node 22 for `loop_json_escape.tests.sh`).
- Keep existing dashboard tests in CI; shell tests should be clearly attributable (separate job or clearly named step).

## Out of Scope
- Do not modify `aloop/bin/loop.sh` or `aloop/bin/loop.ps1` behavior in this issue (Constitution Rule 1, Rule 12).
- Do not modify bash test logic in `aloop/bin/*.tests.sh`; this issue is CI integration only (Rule 12, Rule 19).
- Do not add PowerShell/Pester execution (`aloop/bin/loop.tests.ps1`, `install.tests.ps1`) or Windows CI in this issue.
- Do not perform unrelated CI refactors outside `.github/workflows/ci.yml` (Rule 18, Rule 19).

## Constraints
- Constitution Rule 11 (**Test everything**): CI must enforce these shell tests, not rely on manual runs.
- Constitution Rule 18 (**Respect file ownership**): workflow file changes only unless a strict CI prerequisite requires otherwise.
- Constitution Rule 19 (**Don't gold-plate**): no matrix expansion, caching redesign, or unrelated workflow cleanups.
- Architecture Rule 2 (**Inner loop / runtime separation**): CI executes tests only; no host-side/runtime logic may be moved into loop scripts.
- Execute scripts as plain bash (`bash <script>`), consistent with project testing conventions for shell tests.

## Inputs
- `.github/workflows/ci.yml` — existing CI workflow
- `aloop/bin/*.tests.sh` — bash test scripts

## Outputs
- Updated `.github/workflows/ci.yml` with loop shell test execution

## Acceptance Criteria
- [ ] `.github/workflows/ci.yml` defines a `loop-shell-tests` job (or equivalently clear shell-test step) on `ubuntu-latest`.
- [ ] CI executes every `aloop/bin/*.tests.sh` script listed in Scope using `bash <script>`.
- [ ] `aloop/bin/*.tests.ps1` and `install.tests.ps1` are not executed by this issue.
- [ ] Any non-zero exit from a bash test script fails the shell-test job.
- [ ] Shell-test job failure blocks PR merge via CI status checks.

## Notes
- These are plain bash scripts, not Bats; run directly.
- Prefer a separate shell-test job so failures are clearly attributable.
- PowerShell/Pester coverage is deferred to a future Windows-focused issue.

## Labels
`aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1  
**Dependencies:** none
