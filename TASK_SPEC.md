# Sub-Spec: Issue #34 — Pre-iteration branch sync with conflict detection

## Objective
Implement pre-iteration branch sync so each loop iteration attempts to merge the latest base branch changes before phase selection, and escalates conflicts into the merge-agent flow without breaking the loop.

## Architectural Context
- Loop runner layer: `aloop/bin/loop.sh` and `aloop/bin/loop.ps1` own iteration orchestration, queue consumption, status/log writes, and mechanical git sync.
- Prompt catalog layer: session prompts are sourced from `aloop/templates`; `aloop/templates/PROMPT_merge.md` already defines `agent: merge` with `trigger: merge_conflict`.
- Session contract layer: sync outcomes are persisted via `log.jsonl` events and queued markdown prompts under `session/queue/` for next-iteration execution.

## Scope
- `aloop/bin/loop.sh`
- `aloop/bin/loop.ps1`
- `aloop/templates/PROMPT_merge.md` (only if frontmatter/instructions are incomplete; otherwise reuse as-is)
- `aloop/bin/loop_branch_coverage.tests.sh`
- `aloop/bin/loop.tests.ps1`

## Out of Scope
- `aloop/cli/src/**` runtime/orchestrator logic, request processing, or dashboard behavior (Constitution #2, #12, #18)
- GitHub API / `gh` CLI integration changes (Constitution #1, #4)
- Pipeline/finalizer topology changes in `.aloop/pipeline.yml` (Constitution #6, #19)
- Unrelated refactors or spec rewrites outside branch-sync behavior (Constitution #12, #19)

## Constraints
- This issue explicitly authorizes adding `sync_branch` / `Sync-Branch` in loop runners (Constitution #1 exception clause).
- Keep runner behavior mechanical only: resolve base branch, fetch, merge, detect conflict, emit event, queue prompt, leave markers for resolution. Do not implement conflict resolution in loop scripts (Constitution #1, #8).
- Avoid hardcoded prompt filename routing in loop code; dispatch by prompt frontmatter trigger `merge_conflict` so prompt selection remains data-driven (Constitution #6).
- Base branch resolution must be explicit and identical across Bash/PowerShell: `meta.json.base_branch` -> git-config/remote default branch -> `main` -> `master`.
- Sync must be disableable via config/flag, default enabled (Constitution #15, #19).
- `git fetch` failures are non-fatal and must not end the loop iteration cycle (Constitution #3).
- On conflict, conflict markers must remain in the working tree after `sync_branch` returns so the merge agent (`PROMPT_merge.md`) can resolve them (Constitution #5).

## Implementation Deliverables
### loop.sh
- Add `sync_branch()` that:
  - exits early when sync is disabled
  - resolves base branch using the precedence above
  - runs `git fetch origin <base_branch>` and continues on fetch errors
  - runs `git merge origin/<base_branch> --no-edit`
  - logs `branch_sync` with `base_branch`, `result` (`merged` or `up_to_date`), and `merged_commit_count`
  - on conflict: logs `merge_conflict`, queues merge prompt content matched by `trigger: merge_conflict`, and returns non-zero without terminating loop; conflict markers remain in the working tree for the merge agent to resolve
- Call `sync_branch` once per iteration after queue override handling and before finalizer/mode resolution.

### loop.ps1
- Implement `Sync-Branch` with identical semantics and log field names.
- Invoke at the same iteration point as Bash.

### Prompt template
- Reuse existing `aloop/templates/PROMPT_merge.md`.
- Only patch template if required frontmatter/instructions are missing (`agent: merge`, `trigger: merge_conflict`, resolve+commit instructions).

### Tests
- Extend `aloop/bin/loop_branch_coverage.tests.sh` for:
  - successful merge / up-to-date path
  - fetch failure non-fatal path
  - conflict path (event + queued prompt + markers remain)
  - sync-disabled path
- Extend `aloop/bin/loop.tests.ps1` for equivalent `Sync-Branch` behavior and call-order coverage.

## Acceptance Criteria
- [ ] In both `loop.sh` and `loop.ps1`, pre-iteration sync runs after queue override handling and before iteration mode resolution.
- [ ] With sync enabled and upstream commits available, loop logs `branch_sync` and merge result is applied.
- [ ] With no upstream changes, loop logs `branch_sync` with `result=up_to_date` and `merged_commit_count=0`.
- [ ] If `git fetch` fails (network/auth), loop continues iteration and logs failure context (no process exit).
- [ ] On merge conflict, loop logs `merge_conflict` and enqueues exactly one merge prompt file in session queue; conflict markers remain in the working tree (verified by `git diff --name-only --diff-filter=U` returning at least one entry) so the merge agent can resolve them.
- [ ] Sync can be disabled via config/flag and, when disabled, no fetch/merge commands are attempted.
- [ ] Bash and PowerShell implementations emit equivalent event names/fields and pass their respective tests.
- [ ] Verification commands pass:
  - `bash aloop/bin/loop_branch_coverage.tests.sh`
  - `pwsh -File aloop/bin/loop.tests.ps1`

## Sizing
~2.5 hours

## Aloop Metadata
- Wave: 1
- Dependencies: none

