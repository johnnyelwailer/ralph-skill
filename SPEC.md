# Issue #111: Child loops must auto-push to remote and link branch to GH issue

## Objective

Make child loop branches visible on GitHub immediately after dispatch: push the branch to origin at creation time and link it to the GH issue's development sidebar. PR auto-creation is already implemented.

## Current State (Accurate)

- `launchChildLoop` creates the local git worktree and branch (`aloop/issue-N`) but never pushes to origin. The branch is invisible on GitHub until either a rebase-sync or PR-creation event fires.
- The rebase-sync phase (`process-requests.ts` Phase 2c) pushes after a successful rebase — but only if the child has diverged from trunk.
- PR auto-creation (`process-requests.ts` Phase 2c, lines 403–463) already works: it pushes remaining commits and calls `gh pr create` when `childStatus.state === 'completed' | 'stopped'`. **No changes needed for PR creation.**
- PR gates (`prLifecycleDeps` in `process-requests.ts`) already handle CI → agent review → merge. **No changes needed for PR gates.**
- No `gh issue develop` call is made anywhere — there is no linked branch in the issue sidebar.

## Required Behavior

1. **Initial branch push** — immediately after the git worktree is created in `launchChildLoop`, push the new branch to origin so it appears on GitHub from the moment dispatch happens.
2. **GH issue development link** — after dispatch, call `gh issue develop --branch aloop/issue-N <issue-number> --repo <repo>` so the branch appears in the issue sidebar as a linked development branch.

Items 3 (auto-create PR) and 4 (PR gates) from the original issue are already implemented and must not be re-implemented.

## Architectural Context

The system has two layers:

- **Runtime** (`aloop` CLI — `orchestrate.ts`, `process-requests.ts`): owns all host-side operations — git, GH API calls, process spawning, state management.
- **Inner loop** (`loop.sh`): dumb phase runner — invokes providers, writes `status.json`/logs. No GH API, no network, no git push.

`launchChildLoop` (orchestrate.ts ~2965) is the runtime function that creates the worktree. It already calls `deps.spawnSync` for git operations and is the correct place for the initial push.

The dispatch call sites that have `repo` and `execGh` available are:
- `runOrchestratorScanPass` in `orchestrate.ts` (~line 5383) — `repo` and `deps.execGh` are already used right after dispatch for `syncIssueProjectStatus`.
- The dispatch loop in `process-requests.ts` (~line 3287) — `execGh` and `repo` are available in outer scope.

The GH dev link belongs at these call sites (where `execGh` and `repo` are already threaded through), not inside `launchChildLoop` (which only has `DispatchDeps`, which has no `execGh`).

## Scope

| File | Change |
|------|--------|
| `aloop/cli/src/commands/orchestrate.ts` | In `launchChildLoop`: add `git push -u origin <branchName>` via `deps.spawnSync` after worktree upstream config (after line ~3045). In `runOrchestratorScanPass` dispatch block (~line 5398): add `gh issue develop --branch aloop/issue-N <number> --repo <repo>` call after existing `syncIssueProjectStatus`. |
| `aloop/cli/src/commands/process-requests.ts` | In the `launchChildLoop` call block (~line 3296): add `gh issue develop` call using the outer `execGh` and `repo` variables. |
| `aloop/cli/src/commands/orchestrate.test.ts` | Add test coverage for the initial push in `launchChildLoop`. |
| `aloop/cli/src/commands/process-requests.test.ts` | Add test coverage for GH dev link call at dispatch. |

## Out of Scope

- **`aloop/bin/loop.sh`** — Constitution Rule 1: loop.sh is a dumb runner; no git push, no GH calls, no new functions. Constitution Rule 2: host-side operations (git push, GH API) belong in the runtime, never in loop scripts. Both Option A and Option B from the original issue are prohibited.
- **`aloop/bin/loop.ps1`** — same as above.
- PR creation logic (`process-requests.ts` Phase 2c, lines 403–463) — already implemented, do not touch.
- PR lifecycle (`prLifecycleDeps`) — already implemented, do not touch.
- Any spec files, CONSTITUTION.md, CLAUDE.md, AGENTS.md.

## Constraints

- **Rule 1**: loop.sh/loop.ps1 are dumb runners. No new functions, no GH calls, no git push in loop scripts.
- **Rule 2**: Host-side operations (git push, `gh` CLI calls) belong in the runtime, never in loop scripts.
- **Rule 4**: Agents never call GH APIs. All external operations are mediated by the runtime.
- **Rule 8**: Separation of concerns — `launchChildLoop` owns branch creation/push; dispatch call sites own GH side effects.
- **Rule 11**: Test coverage required for changed behavior.
- **Rule 15**: No hardcoded values — branch name is derived from `issue.number`, not a magic string.
- The initial push is best-effort: if it fails (no origin, no auth), `launchChildLoop` should log and continue rather than throw — the rebase-sync phase will push eventually.
- The `gh issue develop` call is also best-effort: log failure, do not abort dispatch.

## Acceptance Criteria

1. After `launchChildLoop` runs for issue #N, `git ls-remote origin refs/heads/aloop/issue-N` exits 0 (branch exists on remote).
2. After dispatch, running `gh issue view <N> --json developmentBranches` includes a branch named `aloop/issue-N`.
3. `launchChildLoop` unit test verifies `spawnSync` is called with `['push', '-u', 'origin', 'aloop/issue-N']` (or equivalent `HEAD`).
4. Dispatch unit test verifies `execGh` is called with args matching `['issue', 'develop', '--branch', 'aloop/issue-N', ...]`.
5. If the initial push fails, `launchChildLoop` does not throw — it logs a warning and returns normally.
6. No changes to `loop.sh`, `loop.ps1`, or any file in `aloop/bin/`.
7. Existing PR creation tests continue to pass (no regression).

**Wave:** 1
**Dependencies:** none
