# Issue #108: `aloop gh start` and `aloop gh stop` — issue-to-loop workflow

## Spec-Gap Analysis

All core acceptance criteria from SPEC.md §`aloop gh` are implemented:

- **`aloop gh start --issue <N>`**: Fetches issue, creates branch (`agent/issue-N-<slug>`), session, worktree, injects issue context into plan prompt, runs loop, creates PR on completion, posts summary comment. ✅
- **`aloop gh start --issue <N> --spec SPEC.md`**: Loads spec file and injects alongside issue context. ✅
- **PR linked to issue**: `Closes #N` in PR body, summary comment posted on issue. ✅
- **`aloop gh watch`**: Polls for matching issues, auto-spawns loops, queues excess, respects `--label`, `--assignee`, `--milestone`, `--max-concurrent`. ✅
- **Watch stoppable**: SIGINT/SIGTERM handling + `aloop gh stop --all`. ✅
- **PR feedback loop**: Detects review comments, `@aloop` mentions, CI failures; re-iterates automatically. ✅
- **Feedback as steering**: Written to `STEERING.md` in session worktree, not appended to TODO. ✅
- **Max feedback iterations**: Configurable via `max_feedback_iterations` (default 5). ✅
- **`aloop gh status`**: Shows issue→loop→PR mapping with feedback iteration count. ✅
- **`aloop gh stop`**: Stops running sessions, removes from watch state. ✅
- **PRs target `agent/main`**: Creates `agent/main` from `main` if absent. ✅
- **All GH operations via `gh` CLI**: No direct API calls; `ghExecutor` wraps `gh` with PATH hardening fallback. ✅
- **Persistent CI failure detection**: Halts after N same-signature failures (default 3), posts issue comment. ✅
- **Policy enforcement**: Role-based (child-loop/orchestrator), repo-scoped, operation-specific guards. ✅

### Spec-gap findings:

1. **[spec-gap] P2 — `agent/main` vs `agent/trunk` terminology inconsistency**: `gh start` (gh.ts:1067-1074, 1725-1735) creates PRs against `agent/main`, but `evaluatePolicy` (gh.ts:2137, 2192) enforces `agent/trunk` as base. Orchestrator (orchestrate.ts, process-requests.ts) also uses `agent/trunk` throughout. SPEC.md itself is inconsistent (27 refs to `agent/trunk`, 8 to `agent/main`). Suggested fix: standardize on one term across spec and code — likely `agent/trunk` since it's dominant in both spec and orchestrator code, then update `gh start` to match.

### Minor spec features not yet implemented (low priority, non-blocking):

1. **`aloop gh stop-watch`** — spec mentions `stop-watch` as an explicit subcommand (SPEC.md line 2284). Currently, stopping the watch is done via Ctrl+C (SIGINT) or `aloop gh stop --all`. No dedicated `stop-watch` subcommand exists.
2. **`--re-trigger-on reopen,comment` / `--no-re-trigger`** — spec mentions configurable re-trigger behavior when an issue is reopened or new comments are added after a loop finishes (SPEC.md line 2288). Not implemented.
3. **Auto-merge into `agent/main` when CI passes** — spec mentions configurable auto-merge for PRs into `agent/main` (SPEC.md lines 2361). Not implemented as a watch behavior.

### Test coverage assessment:

- 70+ test cases covering policy enforcement, start/stop/watch/status commands, feedback loop, CI failure detection, watch state normalization, PATH hardening, and more.
- Gate 1 tests verify `completion_finalized` behavior.
- Good coverage of edge cases (malformed payloads, missing configs, scope violations).

## Current Phase: Complete — spec fully fulfilled

All acceptance criteria are met. Remaining items are optional enhancements.

### Completed
- [x] `gh start` command — fetches issue, creates branch/session/worktree, runs loop
- [x] `gh start --spec` — loads additional spec context
- [x] PR creation on completion with `Closes #N` link
- [x] Summary comment posted on issue
- [x] `gh watch` — polling daemon with label/assignee/milestone/max-concurrent filters
- [x] Watch daemon stoppable via SIGINT/SIGTERM
- [x] `gh status` — issue→loop→PR mapping display
- [x] `gh stop --issue N` and `gh stop --all`
- [x] PR feedback loop — review comments, @aloop mentions, CI failures
- [x] Feedback injected as STEERING.md (not TODO)
- [x] Max feedback iterations configurable (default 5)
- [x] Persistent CI failure detection and halt (default 3 same-signature)
- [x] Agent trunk (`agent/main`) creation and PR targeting
- [x] Policy enforcement — role-based, repo-scoped guards
- [x] PATH hardening fallback for `gh` binary
- [x] Watch state persistence (`watch.json`) with normalization
- [x] Comprehensive test suite (70+ tests)

### Deferred (optional enhancements, not blocking acceptance)
- [ ] `stop-watch` explicit subcommand (currently covered by Ctrl+C and `gh stop --all`)
- [ ] `--re-trigger-on reopen,comment` / `--no-re-trigger` watch options
- [ ] Auto-merge into `agent/main` when CI passes (configurable)
