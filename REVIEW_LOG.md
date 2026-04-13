# Review Log

## Review — 2026-04-13 09:30 — commit d5a74e20..e3c4b6d7

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `.github/workflows/ci.yml`

**Acceptance criteria status (all PASS):**
- ✅ `on.push.branches`: `master`, `agent/*`, `aloop/*` (ci.yml line 5)
- ✅ `on.pull_request.branches`: `master`, `agent/*`, `aloop/*` (ci.yml line 7)
- ✅ All four required jobs exist: `type-check` (line 14), `cli-tests` (line 45), `dashboard-tests` (line 70), `loop-script-tests` (line 130)
- ✅ No `needs` declarations on any of the four required jobs
- ✅ README badge URL correct (`https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`)
- ✅ `name: CI` stable (line 1)

**Findings:**

- **Gate 5 (HIGH)**: `cli-tests` job calls `npm run build` in `aloop/cli` (ci.yml line 64). The `build` script in `aloop/cli/package.json` starts with `build:dashboard` → `npm --prefix dashboard run build` → `vite build`. But the `cli-tests` job only installs `aloop/cli` deps (line 59-61), never `aloop/cli/dashboard` deps. `vite` is a devDependency of the dashboard — not installed. This job will fail in CI. Written to TODO.md as [review] task.

- **Gate 1 (HIGH)**: `dashboard-e2e` job (ci.yml lines 91-128) was added but is NOT listed in TASK_SPEC.md deliverables or acceptance criteria. TASK_SPEC explicitly specifies exactly four jobs. Adding a fifth job with Playwright caching violates TASK_SPEC constraint ("Do not gold-plate CI") and Constitution #19. Written to TODO.md as [review] task.

- **Gate 1 (MEDIUM)**: `loop-script-tests` job received two extra steps ("Run shell script tests" iterating `aloop/bin/*.tests.sh` and "Run PowerShell script tests" via Pester) beyond what this issue required. Issue #200 scoped work to CI trigger/job polish — not extending the loop-script-tests content. Constitution #12 (one issue, one concern). Written to TODO.md as [review] task.

**Gates that passed:** Gate 2 (N/A — CI config), Gate 3 (N/A), Gate 4 (no dead code), Gate 6 (pure CI config, no observable output to prove — acceptable skip), Gate 7 (N/A — no UI), Gate 8 (Node 22 matches VERSIONS.md, @v4 actions correct), Gate 9 (README badge verified, no other docs needed)
