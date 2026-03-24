# Issue #110: `aloop gh status` + dashboard/copilot command files

## Current Phase: Finalizing command file behavior

### In Progress

### Up Next

- [x] Update `claude/commands/aloop/dashboard.md` to discover active sessions and open browser (priority: high)
  - Run `aloop status --output json`, extract `sessions[].session_id` + `sessions[].work_dir`
  - If one active session → run `aloop dashboard --session-dir ~/.aloop/sessions/<id> --workdir <work_dir>`
  - If multiple sessions → ask user which one (list them by session_id + work_dir)
  - If no active sessions → inform user and offer to run `aloop dashboard` without a specific session
  - After launching, open browser to `http://localhost:<port>` (default 3000)
  - Spec section: "UX: Dashboard, Start Flow, Auto-Monitoring §4. /aloop:dashboard command + copilot prompt"

- [x] Update `copilot/prompts/aloop-dashboard.prompt.md` with same session-discovery + browser-open behavior (priority: high)
  - Mirror the claude command logic: session discovery via `aloop status --output json`, single/multi/none handling, browser open

### Completed

- [x] `aloop gh status` — title column, ANSI colors, aggregate stats implemented in `gh.ts`
  - Title column with truncation and em-dash fallback
  - ANSI colors: yellow=running, green=completed, red=stopped (TTY-gated)
  - `colorizeStatus` helper + `useTTY` parameter on `formatGhStatusRows`
  - `computeGhStats` returns `{total, active, completed, prsPending}`
  - Aggregate stats footer line in `ghStatusCommand`
  - Tests: title column, ANSI colors, `computeGhStats`, `enqueueIssue` title storage

- [x] `claude/commands/aloop/dashboard.md` exists in `claude/commands/aloop/`
  - Satisfies acceptance criteria: "command file exists in `claude/commands/aloop/`"

- [x] `copilot/prompts/aloop-dashboard.prompt.md` exists in `copilot/prompts/`
  - Satisfies acceptance criteria: "`aloop-dashboard.prompt.md` exists in `copilot/prompts/`"

### Spec-Gap Analysis

- [ ] [spec-gap] P3 — `aloop gh status` table has an extra `Title` column not shown in SPEC
  - SPEC (line 2299) shows columns: `Issue Branch PR Status Iteration Feedback`
  - Implementation (`gh.ts:1310`) adds a 30-char `Title` column between Issue and Branch
  - Files: `aloop/cli/src/commands/gh.ts`, `SPEC.md §aloop gh status`
  - Suggested fix: update SPEC table to include the Title column (code is correct; spec example is stale)

- [ ] [spec-gap] P3 — SPEC describes `--session` flag for dashboard command, but CLI uses `--session-dir`
  - SPEC (line 1059): "Invokes `aloop dashboard --session <active-session-id>`"
  - Actual CLI and command files use `--session-dir ~/.aloop/sessions/<id> --workdir <path>`
  - Files: `SPEC.md §4. /aloop:dashboard command`, `claude/commands/aloop/dashboard.md`, `copilot/prompts/aloop-dashboard.prompt.md`, `aloop/cli/src/commands/dashboard.ts`
  - Suggested fix: update SPEC line 1059 to reflect actual `--session-dir` + `--workdir` flags

_No P1 or P2 gaps found. All issue #110 acceptance criteria are satisfied. P3 gaps above are cosmetic spec-text drift only and do not block completion._
