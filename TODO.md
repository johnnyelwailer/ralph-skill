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

## Spec-Gap Findings (Out of Scope — File as Separate Issues)

The spec-gap agent identified the following discrepancies in files outside issue #200's scope.
Per CONSTITUTION rules 12, 18, and 21, these must NOT be fixed in this PR — file new issues.

### [spec-gap] P2 — Cross-runtime CLAUDE_MODEL default mismatch

**What:** `aloop/bin/loop.sh:33` defaults `CLAUDE_MODEL` to `sonnet`, but `aloop/config.yml` (source of truth) specifies `claude: opus` and `aloop/bin/loop.ps1:34` also defaults to `opus`. Cross-runtime parity is broken.

**Files:** `aloop/bin/loop.sh:33`, `aloop/bin/loop.ps1:34`, `aloop/config.yml:21`

**Action:** File a new issue to fix `loop.sh:33` — change `sonnet` to `opus` to match `config.yml` and `loop.ps1`.

### [spec-gap] P3 — loop.sh header comment omits `opencode` from provider list

**What:** `aloop/bin/loop.sh:12-13` lists "claude, codex, gemini, copilot, round-robin" — `opencode` is missing. Runtime code at line 31 correctly includes it. Comment is stale.

**Files:** `aloop/bin/loop.sh:12-13`

**Action:** File a new issue or include in the CLAUDE_MODEL fix issue above.

### [spec-gap] P3 — config.yml missing `on_start:` section

**What:** SPEC.md specifies `on_start: { monitor: dashboard, auto_open: true }` in `config.yml`, but this block is absent.

**Files:** `aloop/config.yml`, SPEC.md (UX/Dashboard section)

**Action:** File a new issue to add the `on_start:` section to `config.yml` or update SPEC.md if this is Planned.
