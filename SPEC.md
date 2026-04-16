# Issue #67: Pre-iteration branch sync with conflict detection in loop.ps1

## Objective
Port pre-iteration base-branch sync semantics to `aloop/bin/loop.ps1` so it matches `loop.sh`: fetch base, merge base, detect conflicts, queue merge resolution prompt, and log sync outcomes without breaking loop progression.

## Architectural Context
- This change is confined to the loop-runner layer in [`aloop/bin/loop.ps1`] and must remain mechanical Git orchestration only.
- The sync logic runs inside the main `while` iteration flow, after provider refresh/provider resolution and before `Run-QueueIfPresent`.
- State/config source: `$SessionDir/meta.json` (base branch configuration).
- Side effects:
  - Git operations in `$WorkDir`: `git fetch origin <base>` and `git merge origin/<base> --no-edit`
  - Event log writes via `Write-LogEntry` into `$SessionDir/log.jsonl`
  - Queue file write to `$SessionDir/queue/PROMPT_merge.md` for conflict resolution
- Behavioral parity target is the completed `loop.sh` branch-sync implementation; PowerShell should be idiomatic but semantically equivalent.

## Scope
In scope for modification:
- `aloop/bin/loop.ps1`
- `aloop/bin/loop.tests.ps1` (or equivalent loop regression tests) to cover new branch-sync behavior per Constitution Rule 11.

## Out of Scope
Do not modify:
- `aloop/bin/loop.sh` (reference only for parity)
- `aloop/cli/src/**` runtime/orchestrator logic (`process-requests`, GH orchestration, request bridge)
- Prompt templates and pipeline wiring (`aloop/templates/**`, `.aloop/pipeline.yml`) beyond consuming existing `PROMPT_merge.md`
- Any unrelated refactors or feature work outside branch sync in `loop.ps1`

Rationale: Constitution Architecture Rules 1-2 and Scope Rules 12, 18, 19.

## Constraints
- **Constitution Rule 1 (dumb runner):** keep logic mechanical; no business logic or conflict resolution strategy in-loop.
- **Constitution Rule 2 (runtime separation):** no GH/network API orchestration beyond git fetch/merge; no `aloop` CLI/GH workflow additions in loop script.
- **Constitution Rule 3 (no mid-cycle exit):** fetch/merge failures must not terminate the loop iteration.
- **Constitution Rule 6 (data-driven):** do not alter cycle planning/phase sequencing; integrate via existing queue mechanism only.
- **Constitution Rule 11 (tests required):** add regression tests for success, noop, conflict, and fetch-failure paths.
- Keep one-concern scope (Rule 12): this issue is only PowerShell branch-sync parity.
- Base-branch lookup contract for this issue: read `meta.json.baseBranch`; if absent, fallback to `meta.json.base_branch` for SPEC compatibility.

## Implementation Notes
### Branch sync function
```powershell
function Sync-BaseBranch {
  # Read base branch from $SessionDir/meta.json (baseBranch, fallback base_branch)
  # If missing/empty: skip silently
  # git fetch origin <base_branch>
  # If fetch fails: Write-Warning and continue iteration (no throw)
  # git merge origin/<base_branch> --no-edit
  # If merge output indicates "Already up to date.": log branch_sync_noop
  # If merge succeeds with changes: log branch_sync
  # If merge conflict: log merge_conflict, queue PROMPT_merge.md to $SessionDir/queue/, return $false
  # Otherwise return $true
}
```

### Iteration integration
- Invoke `Sync-BaseBranch` at the top of each iteration before `Run-QueueIfPresent`.
- Preserve existing queue execution flow so a queued merge prompt is picked up by standard queue handling.
- Use same event names as loop.sh parity contract: `branch_sync`, `branch_sync_noop`, `merge_conflict`.

## Acceptance Criteria
- [ ] `Sync-BaseBranch` is called once per iteration before queue processing (`Run-QueueIfPresent`).
- [ ] With configured base branch and successful fetch+merge that updates refs/content, log includes `event="branch_sync"`.
- [ ] With configured base branch and merge result "Already up to date", log includes `event="branch_sync_noop"`.
- [ ] On merge conflict, log includes `event="merge_conflict"` and `$SessionDir/queue/PROMPT_merge.md` is written.
- [ ] On merge conflict, loop does not exit; normal queue handling runs and can consume the queued merge prompt.
- [ ] If base branch is missing/unconfigured in `meta.json`, sync is skipped silently (no fetch/merge attempt, no failure).
- [ ] If `git fetch` fails (network/auth/transient), a warning is emitted and iteration continues (no loop abort).
- [ ] Behavior (event names, ordering, conflict queue semantics) is equivalent to loop.sh implementation.
- [ ] Regression tests cover: success sync, noop sync, conflict queueing, missing base branch skip, and fetch-failure non-blocking behavior.

## Inputs
- `aloop/bin/loop.ps1` — main iteration loop
- Completed `loop.sh` branch sync implementation (semantic reference)
- `SPEC.md` §Branch Sync (lines 2877-2925)
- `meta.json` base branch field (`baseBranch`, fallback `base_branch`)

## Deliverables
- Implement `Sync-BaseBranch` in `aloop/bin/loop.ps1`
- Wire pre-iteration invocation in main loop before queue processing
- Add/extend regression tests in `aloop/bin/loop.tests.ps1`
