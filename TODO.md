# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Acceptance Criteria

- [x] `.github/workflows/ci.yml` contains `on.push.branches` with `master`, `agent/*`, and `aloop/*`
- [x] `.github/workflows/ci.yml` contains `on.pull_request.branches` with `master`, `agent/*`, and `aloop/*`
- [x] `.github/workflows/ci.yml` defines all four jobs: `cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`
- [x] None of the four required jobs declares `needs` (jobs are independently runnable)
- [x] `README.md` contains the CI badge URL `https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Workflow file `.github/workflows/ci.yml` has `name: CI`

## Tasks

### Completed
- [x] Implement as described in the issue — all acceptance criteria verified in `.github/workflows/ci.yml` and `README.md`

---

## Spec-Gap Analysis

### [spec-gap] P2 — Cross-runtime CLAUDE_MODEL default mismatch

**What:** `aloop/bin/loop.sh` line 33 defaults `CLAUDE_MODEL` to `sonnet`, but `aloop/config.yml` (declared source of truth) specifies `claude: opus` and `aloop/bin/loop.ps1` line 34 also defaults to `opus`. Cross-runtime parity is broken.

**Files:** `aloop/bin/loop.sh:33`, `aloop/bin/loop.ps1:34`, `aloop/config.yml:21`

**Spec says:** SPEC.md "Cross-file Consistency" section — defaults must be in parity between `loop.sh` and `loop.ps1`; `config.yml` is the single source of truth for model defaults.

**Suggested fix (code is wrong):** Update `loop.sh` line 33 to `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-opus}"` to match `config.yml` and `loop.ps1`.

### [spec-gap] P3 — loop.sh header comment omits `opencode` from provider list

**What:** `aloop/bin/loop.sh` lines 12-13 header comment lists "claude, codex, gemini, copilot, round-robin" — `opencode` is missing. Runtime code at line 31 (`ROUND_ROBIN_PROVIDERS`) and line 65 (`--round-robin` help text) correctly include `opencode`. Comment is stale.

**Files:** `aloop/bin/loop.sh:12-13`

**Suggested fix (code is wrong):** Update the comment to "claude, opencode, codex, gemini, copilot, round-robin".

### [spec-gap] P3 — config.yml missing `on_start:` section

**What:** SPEC.md UX section specifies a `config.yml` option block `on_start: { monitor: dashboard, auto_open: true }` to control dashboard auto-launch behavior on `aloop start`. This block is absent from `aloop/config.yml`.

**Files:** `aloop/config.yml`, `SPEC.md` (UX/Dashboard/Auto-monitoring section)

**Suggested fix:** Add the `on_start:` section with documented defaults to `aloop/config.yml`, or update SPEC.md to mark it as Planned if not yet implemented.
