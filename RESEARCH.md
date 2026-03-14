# Research Log

## 2026-03-07 18:33 +01:00 — Devcontainer spec baseline for `/aloop:devcontainer` [T1+T2+T3]

- Confirmed authoritative sources and scope for implementation:
  - Use `containers.dev` implementor spec/reference as source of truth for `devcontainer.json` shape and lifecycle semantics.
  - Use VS Code devcontainer docs for CLI workflow and operational patterns.
  - Source: https://containers.dev/implementors/spec/ (T1), https://containers.dev/implementors/json_reference/ (T1), https://code.visualstudio.com/docs/devcontainers/create-dev-container (T1), `SPEC.md` devcontainer prerequisite section (T3)
- Lifecycle order to implement in generated configs and verification expectations:
  - `initializeCommand` (host) runs before container start, then `onCreateCommand` -> `updateContentCommand` -> `postCreateCommand`; on every start/attach: `postStartCommand` then `postAttachCommand`.
  - `waitFor` defaults to `updateContentCommand`.
  - Source: https://containers.dev/implementors/json_reference/ (T1), https://containers.dev/implementors/spec/ (T1)
- `devcontainer.json` constraints for generation:
  - `features` is a map keyed by feature ID (`ghcr.io/devcontainers/features/...`) with option objects.
  - `mounts` accepts Docker `--mount` syntax (string or object form).
  - Variable substitution supports `${localEnv:VAR}`, `${containerEnv:VAR}`, `${localWorkspaceFolder}`, `${containerWorkspaceFolder}` and related forms.
  - Source: https://containers.dev/implementors/json_reference/ (T1), https://containers.dev/implementors/features/ (T1)
- Environment forwarding semantics that affect provider auth strategy:
  - `containerEnv` applies to all processes in the container.
  - `remoteEnv` applies to VS Code and its subprocesses/terminals; can reference `${containerEnv:PATH}` and `${localEnv:VAR}`.
  - Source: https://code.visualstudio.com/remote/advancedcontainers/environment-variables (T1)
- Workspace/worktree mounting decisions for upcoming implementation:
  - VS Code defaults source mount to project root (or git root if `git` exists); override with `workspaceMount` + `workspaceFolder` when needed.
  - For Aloop worktrees under `~/.aloop/sessions/<id>/worktree`, plan to ensure explicit mount accessibility plus `devcontainer exec --workspace-folder <worktree>`.
  - Source: https://code.visualstudio.com/remote/advancedcontainers/change-default-source-mount (T1), `SPEC.md` devcontainer integration/worktree sections (T3)
- Docker Compose support remains first-class and should be augmentation-safe:
  - Existing `.devcontainer` setups may use `dockerComposeFile` + `service`; generation flow should augment, not replace, existing config.
  - Source: https://code.visualstudio.com/docs/devcontainers/create-dev-container (T1), https://code.visualstudio.com/remote/advancedcontainers/connect-multiple-containers (T1), `TODO.md` devcontainer/P1 augmentation task (T3)
- CLI command behaviors required for verification loop:
  - `devcontainer build`, `devcontainer up`, `devcontainer exec`, and `devcontainer read-configuration` are documented and should be used in verification/fail-fix-reverify flow.
  - Source: https://code.visualstudio.com/docs/devcontainers/devcontainer-cli (T1), https://github.com/devcontainers/cli (T1), `SPEC.md` devcontainer verification requirements (T3)
- Local environment check for this machine:
  - `devcontainer` CLI is currently not installed in this workspace environment (`Get-Command devcontainer` returns not found).
  - Source: command run `Get-Command devcontainer -ErrorAction SilentlyContinue`; command run `if (Get-Command devcontainer -ErrorAction SilentlyContinue) { devcontainer --version } else { Write-Output "devcontainer CLI not installed" }` (T2)

## 2026-03-14 11:50 +01:00 — P2 gap analysis: triage, pipeline, GH integration, status tree [T2+T3]

### Triage Agent — Gap Summary

- `aloop gh` (gh.ts:36-42) currently has 7 subcommands: `pr-create`, `pr-comment`, `issue-comment`, `issue-create`, `issue-close`, `pr-merge`, `branch-delete`. Missing: `issue-comments` (list with `--since`), `pr-comments` (list with `--since`), `issue-label` (add/remove labels). These are prerequisites for triage polling.
  - Source: `aloop/cli/src/commands/gh.ts:36-42` (T2 — direct inspection)
- `flagForHuman()` in orchestrate.ts:854-871 adds the `aloop/blocked-on-human` label, but there is NO code to remove the label, no pause/resume flow in child loops, and no auto-unblock on human response.
  - Source: `aloop/cli/src/commands/orchestrate.ts:854-871` (T2 — direct inspection)
- No triage classification logic exists (actionable/needs_clarification/question/out_of_scope). No agent invocation, no confidence scoring.
  - Source: grep for `triage|classification|actionable|needs_clarification` across all .ts files returned 0 hits (T2)
- No processed-comment tracking. `OrchestratorIssue` interface (orchestrate.ts:34-43) lacks `last_comment_check`, `blocked_on_human`, and `triage_log` fields.
  - Source: `aloop/cli/src/commands/orchestrate.ts:34-43` (T2 — direct inspection)
- Child loop (start.ts) does not check for `aloop/blocked-on-human` label before iterations — no pause mechanism exists.
  - Source: `aloop/cli/src/commands/start.ts` (T2 — searched for "blocked" — no hits)

### Configurable Agent Pipeline — Gap Summary

- No `pipeline.yml` exists. No pipeline config in `aloop/config.yml`. The config only has `default_mode`, model defaults, and retry settings.
  - Source: `aloop/config.yml` (T2 — direct inspection)
- No `.aloop/agents/` directory. Agent definitions are hardcoded as `PROMPT_*.md` templates in `aloop/templates/`.
  - Source: file listing of `aloop/templates/` (T2)
- Loop scripts (loop.sh:300-336, loop.ps1) have hardcoded phase cycles. `resolve_iteration_mode()` uses fixed case statements with only 5 predefined modes: `plan`, `build`, `review`, `plan-build`, `plan-build-review`. No extensibility.
  - Source: `aloop/bin/loop.sh:300-336` (T2 — direct inspection)
- Steering via STEERING.md exists (loop.sh:1490-1504) but only forces a `steer` phase — NOT full pipeline mutation.
  - Source: `aloop/bin/loop.sh:1490-1504` (T2 — direct inspection)
- Guard agent pattern: fully specified in SPEC.md:2253-2271 but not implemented. No escalation ladder logic.
  - Source: `SPEC.md:2253-2271` (T3), grep for `guard|escalat` in .ts/.sh/.ps1 returned 0 hits (T2)

### GitHub-Integrated Workflows — Gap Summary

- `aloop gh start --issue <N>`: NOT implemented. No `start` subcommand in gh.ts. Only policy-enforcement subcommands exist.
  - Source: `aloop/cli/src/commands/gh.ts:36-42` (T2 — direct inspection)
- `aloop gh watch`: NOT implemented. No daemon/polling logic, no `watch.json`, no event-driven issue processing.
  - Source: grep for `watch|daemon|poll` in gh.ts returned 0 hits (T2)
- `aloop gh status`: NOT implemented. Current `aloop status` (status.ts) shows flat session list without GH issue/PR mapping.
  - Source: `aloop/cli/src/commands/status.ts` (T2 — direct inspection)
- `aloop gh stop`: NOT implemented. Current `stop.ts` only handles generic session IDs.
  - Source: `aloop/cli/src/commands/stop.ts` (T2 — direct inspection)
- PR feedback loop: NOT implemented. No review-comment detection, no CI-failure-triggered re-iteration, no max-feedback-iterations.
  - Source: grep for `feedback|re-iterate|pr-check` in all .ts files returned 0 hits (T2)

### Orchestrator Status Tree — Gap Summary

- `aloop status` (status.ts) shows active sessions and provider health in a flat list. Zero references to `child_session`, orchestrator tree, or issue/PR mapping.
  - Source: `aloop/cli/src/commands/status.ts` (T2 — direct inspection)

### Architecture Reconciliation — Spec vs Implementation

- SPEC constraints (SPEC.md:40-47): zero npm deps, `.mjs` only, no build step.
- Reality: CLI has `commander@^12.0.0` production dependency, TypeScript source compiled via esbuild to `dist/index.js`. Two entry points: `aloop.mjs` (SPEC-compliant core) and `dist/index.js` (extended commands needing npm deps + build).
- `lib/config.mjs` promised in SPEC Phase 1 (line 18) does NOT exist. Only `lib/project.mjs` and `lib/session.mjs`.
  - Source: `aloop/cli/package.json` (T2), `aloop/cli/aloop.mjs` (T2), SPEC.md:40-47 (T3)

### Legacy-Name Guard

- No automated guard exists. No forbidden-reference checks in CI or code. TODO.md line 37 tracks this as P3.
  - Source: grep for `legacy|forbidden|guard` in .ts files returned 0 hits (T2)

## 2026-03-14 12:15 +01:00 — Detailed gap analysis: review gates + dashboard/proof/exit-state [T2+T3]

### Review Gate 1: orchestrate.ts triage — monitor loop + comment actions

- Triage helpers (classifyTriageComment, applyTriageResultsToIssue, etc.) are fully exported from orchestrate.ts but **never invoked in any monitor loop**. The main `orchestrateCommandWithDeps` (lines 352-415) only initializes state and applies decomposition — no polling loop exists.
  - Source: `aloop/cli/src/commands/orchestrate.ts:352-415` (T2 — direct inspection)
- `applyTriageResultsToIssue` handles `needs_clarification` (adds label, sets blocked_on_human=true) and `question` (records action only) but:
  - **No follow-up comment is posted** for needs_clarification — spec requires posting a question on the issue/PR (SPEC.md:1719)
  - **No answer comment is posted** for question — spec requires agent-drafted answer (SPEC.md:1901)
  - **No triage footer marker** on any posted comments — spec requires footer "This comment was generated by aloop triage agent." (SPEC.md:1845-1850)
  - **No authorship filtering** — spec says skip bot/external comments (SPEC.md:1835-1843), code processes all comments indiscriminately
  - Source: `aloop/cli/src/commands/orchestrate.ts:560-623` (T2), `SPEC.md:1719,1835-1850,1901` (T3)

### Review Gate 2: orchestrate.test.ts triage test assertions

- Two triage tests exist (lines 728-791):
  - Test 1: needs_clarification — asserts label add and blocked flag, but uses `ghCalls.includes(...)` partial matching, not exact args
  - Test 2: actionable unblock — asserts label remove and blocked flag reset, also partial matching
- Missing test cases: `question` classification, `out_of_scope` classification, `steering_injected` (actionable when not blocked), `deps.execGh` error path, multi-comment mixed classification pass
  - Source: `aloop/cli/src/commands/orchestrate.test.ts:728-791` (T2 — direct inspection)

### Review Gate 3: gh.ts branch coverage (<80%)

- Key untested branches identified:
  - `issue-label` remove action (gh.ts:159-162): only `add` tested, `--remove-label` path untested
  - `parseGhOutput` non-array JSON for issue-comments/pr-comments (gh.ts:199): non-array falls back to `[]` but never tested
  - `parseGhOutput` regex no-match for pr-create/issue-create (gh.ts:187,192): null match path untested
  - `parsePositiveInteger` (gh.ts:71-84): zero, negative, boolean, non-numeric string branches untested
  - `includesAloopAutoLabel` non-array input (gh.ts:88): returns false for non-array, untested
  - `buildGhArgs` default/unknown-operation throw (gh.ts:176-178): untested
  - `ghExecutor.exec` error path (gh.ts:303-318): untested
  - `parseGhOutput` JSON.parse failure path (gh.ts:321-340): untested
  - Source: `aloop/cli/src/commands/gh.ts` and `gh.test.ts` (T2 — direct inspection)

### Dashboard UX gaps (steering 20260314T121259Z_iter8)

- **Provider + model per iteration**: App.tsx shows only provider name, not model. Missing per-iteration duration in log rows.
  - Source: `aloop/cli/dashboard/src/App.tsx:207,359,383` (T2)
- **Session timing header**: No elapsed time since session_start, no total iterations, no average duration in header.
  - Source: `aloop/cli/dashboard/src/App.tsx:400` (T2)
- **Commit diffstat**: Commit detail views do not show diffstat or per-file M/A/D/R markers.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — no commit detail component found)
- **Docs tabs**: Render for ALL docs in object, no check for empty content. No overflow dropdown.
  - Source: `aloop/cli/dashboard/src/App.tsx:572` (T2)

### Proof prompt quality

- `PROMPT_proof.md` correctly requires observable human-verifiable artifacts and bans CI output / typecheck summaries / git diffs as proof. No changes needed.
  - Source: `aloop/templates/PROMPT_proof.md:20-24,77,81` (T2)

### Loop exit state + stuck_count

- `loop.sh` writes status.json with `write_status()` but uses `"completed"`, `"limit_reached"`, `"interrupted"` — does NOT write `"stopped"` or `"exited"` as spec requires.
  - Source: `aloop/bin/loop.sh:420-422,1476,1534,1666` (T2), `SPEC.md:921` (T3)
- `STUCK_COUNT` is only reset when a task is skipped (loop.sh:1145), NOT on successful iteration as spec requires.
  - Source: `aloop/bin/loop.sh:1145` (T2), `SPEC.md:922` (T3)
- Dashboard has no dead PID detection — reads status.json state but doesn't validate whether the PID is still alive.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — no PID check found)

## 2026-03-14 12:28Z — Recheck and drift correction: triage prerequisites landed; monitor/action gaps remain [T2+T3]

- Recheck invalidated part of the 11:50 entry: `aloop gh` now includes triage prerequisite subcommands (`issue-label`, `issue-comments --since`, `pr-comments --since`), so those are no longer missing.
  - Source: `aloop/cli/src/commands/gh.ts:54-58,170-175` (T2 — direct inspection)
- Triage state fields now exist on orchestrator issues (`last_comment_check`, `blocked_on_human`, `processed_comment_ids`, `triage_log`), so that earlier missing-state finding is also no longer current.
  - Source: `aloop/cli/src/commands/orchestrate.ts:43-47` (T2 — direct inspection)
- Core gap still stands: orchestrator command flow initializes/persists state but does not run a monitor-cycle triage loop (no polling/processing path invoking triage in `orchestrateCommandWithDeps`).
  - Source: `aloop/cli/src/commands/orchestrate.ts:352-415` and command search `rg "applyTriageResultsToIssue\\(|issue-comments|pr-comments" aloop/cli/src/commands/orchestrate.ts` (only declaration hits, no orchestration callsite) (T2)
- `applyTriageResultsToIssue` still does label toggling/logging only; it does **not** post clarification/question replies, does not add a required triage footer, and does not filter bot/external authors before classification.
  - Source: `aloop/cli/src/commands/orchestrate.ts:560-623`, `SPEC.md` triage sections (`Comment Authorship Filtering`, footer requirement, question/clarification behaviors) (T3)
- `orchestrate.test.ts` triage action assertions remain partial and narrow (2 action-path tests, `includes(...)` checks, no explicit coverage for `question`, `out_of_scope`, or `execGh` failure paths).
  - Source: `aloop/cli/src/commands/orchestrate.test.ts:728-791` (T2 — direct inspection)
- `gh.ts` command-surface still lacks the higher-level workflow commands from spec (`aloop gh start/watch/status/stop`); current command only exposes policy-enforced low-level GH operations.
  - Source: `aloop/cli/src/commands/gh.ts:18-58`; command search `rg "command\\('start'|command\\('watch'|command\\('status'|command\\('stop'" aloop/cli/src/commands/gh.ts` returned no matches (T2), `SPEC.md` GH-integrated workflow section (T3)
- Dashboard regressions remain open: header shows provider but not model; no aggregate timing context (session elapsed since start, total iterations, average iteration duration); docs panel includes all non-TODO docs without filtering empty content/overflow handling.
  - Source: `aloop/cli/dashboard/src/App.tsx:207,359,381-384,399-402,572-586` (T2), steering intent in `TODO.md` current phase (T3)
- Runtime exit-state gap remains in shell loop implementation: `status.json` writes `completed`, `interrupted`, and `limit_reached` states; no `stopped`/`exited` state currently emitted, and stuck counter reset is tied to skip path rather than successful iteration completion.
  - Source: `aloop/bin/loop.sh:418-422,1145,1471,1534,1666` (T2), `SPEC.md` exit-state/stuck reset requirements (T3)
- `aloop status` remains flat session/health output and does not yet render orchestrator tree (orchestrator -> child sessions -> issue/PR mapping).
  - Source: `aloop/cli/src/commands/status.ts:44-70` (T2), `SPEC.md` orchestrator/status visibility expectations (T3)
- Existing TODO coverage command text is likely stale for current TS test harness: running `node --experimental-test-coverage --test src/commands/gh.test.ts` in `aloop/cli` fails with `ERR_MODULE_NOT_FOUND` for `src/commands/gh.js` (tests import transpiled `.js` paths via `tsx` workflow).
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --test src/commands/gh.test.ts` (T2)

## 2026-03-14 12:53Z — Planning recheck: triage wiring progressed; steering persistence and runtime parity still open [T2+T3]

- Triage monitor-cycle plumbing is now present and executed during orchestrator initialization when `repo` + `execGh` are available.
  - Source: `aloop/cli/src/commands/orchestrate.ts:414-416,786-837` (T2 — direct inspection), `aloop/cli/src/commands/orchestrate.test.ts:176-228,1179-1283` (T2)
- Remaining triage core gap: actionable classification records `steering_injected` in state/log only; no STEERING/TODO mutation is performed in this path.
  - Source: `aloop/cli/src/commands/orchestrate.ts:654-663` (T2), command run `rg "STEERING\\.md|steering_injected|writeFile\\(|TODO\\.md" aloop/cli/src/commands/orchestrate.ts` (only `steering_injected` marker and initial TODO seed writes, no actionable steering write path) (T2), `SPEC.md:1713-1716,1897` (T3)
- Baseline regression still present in session tests: `resolveHomeDir trims trailing separators...` fails on Linux/Git-Bash style path handling in targeted run.
  - Source: command run `cd aloop/cli && npx --yes tsx --test src/commands/session.test.ts` (fails at `src/commands/session.test.ts:52-58` with expected `/C:\\temp\\demo` vs actual path-resolved suffix) (T2)
- Proof artifact gate remains red in this workspace: expected artifacts are not currently present.
  - Source: command run `glob "**/{proof-run.log,monitor-cycle-proof.json,triage-action-policy-proof.json}"` (no matches) (T2)
- Dashboard still lacks automatic dead-PID liveness correction in state publication path; process signaling exists only on stop API route.
  - Source: `aloop/cli/src/commands/dashboard.ts:519-679` (state loading/publishing path reads status/active without pid liveness probe), `aloop/cli/src/commands/dashboard.ts:817-854` (PID signal handling only in stop endpoint) (T2), `SPEC.md:900-901,921` (T3)
- Prior low-priority task about missing dashboard `vite` prerequisite is stale: dashboard package already declares `vite` and `build` script.
  - Source: `aloop/cli/dashboard/package.json:7-9,34-40` (T2)

## 2026-03-14 13:24Z — Planning recheck: triage corrections + remaining spec gaps [T2+T3]

- Earlier triage-footer/filtering gap is now resolved: orchestrator triage replies include the required footer marker, and comment filtering skips agent-generated/bot comments plus external authors.
  - Source: `aloop/cli/src/commands/orchestrate.ts:569-601,659-686` (T2 — direct inspection), `SPEC.md:1835-1850` (T3)
- Remaining high-priority triage gap: actionable comments without `issue.child_session` still log `action_taken: "steering_injected"` even though `injectSteeringToChildLoop()` no-ops when no child exists, so guidance is effectively dropped.
  - Source: `aloop/cli/src/commands/orchestrate.ts:612-615,678-681` (T2 — direct inspection), `SPEC.md:1713-1716,1897` (T3)
- Regression coverage gap remains for that pre-dispatch path: no test currently asserts actionable triage behavior when `child_session` is missing.
  - Source: command run `rg "child_session|without child|pre-dispatch|steering_injected should" aloop/cli/src/commands/orchestrate.test.ts -n` (T2)
- Runtime/state parity gaps remain: loop status still writes `completed`/`limit_reached`/`interrupted` instead of required `stopped`/`exited`, and `STUCK_COUNT` reset is tied to skip handling rather than successful iteration completion.
  - Source: `aloop/bin/loop.sh:1145,1471,1534,1632,1666` (T2 — direct inspection), `SPEC.md:899-902,921-922` (T3)
- Dashboard/runtime gaps remain open: no dead-PID auto-correction in publish/state path; header still shows provider but not model/timing aggregates; docs panel still lists all non-TODO docs without non-empty filtering/overflow handling.
  - Source: `aloop/cli/src/commands/dashboard.ts:556-589,664-677` (T2), `aloop/cli/dashboard/src/App.tsx:207,359,382-384,572-586` (T2), `SPEC.md:900,917-920` (T3)
- GH workflow surface remains incomplete versus spec: `gh.ts` exposes low-level policy commands (including triage helpers) but still lacks `aloop gh start/watch/status/stop` orchestration commands.
  - Source: `aloop/cli/src/commands/gh.ts:48-58` (T2), `SPEC.md:1290-1361,1418-1428` (T3)
- Pipeline config model from spec is still not present in-repo (`.aloop/pipeline.yml`, `.aloop/agents/` missing).
  - Source: command run `glob "**/pipeline.yml"` (no matches) and `glob "**/.aloop/agents/**"` (no matches) in repo root (T2), `SPEC.md:2314-2317` (T3)
- `gh.ts` targeted branch-coverage gaps likely remain in tests: no evidence of `issue-label` remove-path assertions or parser error/fallback-path tests.
  - Source: command run `rg "(--remove-label|label_action:\\s*'remove'|Unknown operation|Cannot build gh args|gh_operation_error)" aloop/cli/src/commands/gh.test.ts -n` (no matches) (T2)

## 2026-03-14 14:05Z — Planning recheck: newly landed fixes vs remaining parity gaps [T2+T3]

- Previously open triage-loss gap is now fixed: actionable comments with no `child_session` are queued as deferred steering (`steering_deferred` + `pending_steering_comments`) and flushed when a child session appears.
  - Source: `aloop/cli/src/commands/orchestrate.ts:630-707` (T2 — direct inspection), `aloop/cli/src/commands/orchestrate.test.ts:1040-1102` (T2 — direct inspection)
- Dashboard dead-PID auto-correction is now implemented in state loading/publish path via liveness probing (`process.kill(pid, 0)` + `withLivenessCorrectedState`).
  - Source: `aloop/cli/src/commands/dashboard.ts:177-225` (T2 — direct inspection)
- Runtime exit-state parity is still incomplete vs spec: loop scripts still write `state: "completed"` on successful completion paths, while spec requires exit reporting as `stopped`/`exited`.
  - Source: `aloop/bin/loop.sh:1534,1633` (T2), `aloop/bin/loop.ps1:1672,1774` (T2), `SPEC.md:900-924` (T3)
- `gh.ts` branch coverage remains below the >=80 target (currently `78.46%` branches) despite all current `gh.test.ts` tests passing.
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (coverage line: `gh.ts ... branch % 78.46`) (T2)
- High-level GH workflow commands remain missing from `gh.ts` (`start`, `watch`, `status`, `stop` command surface not present).
  - Source: `aloop/cli/src/commands/gh.ts:48-58` (T2), command run `rg "command\\('start'\\)|command\\('watch'\\)|command\\('status'\\)|command\\('stop'\\)" aloop/cli/src/commands/gh.ts -n` (no matches) (T2), `SPEC.md` GH workflow sections (T3)
- Dashboard UI parity gaps remain: header still uses wrapping flex layout (not required grid), provider/model are not shown together, and docs tab list still includes all non-TODO doc keys without non-empty filtering or overflow menu behavior.
  - Source: `aloop/cli/dashboard/src/App.tsx:295,359,382-384,399-402,572-589` (T2), `SPEC.md:918-923` (T3)
- Loop branch-evidence state: shell harness now produces verifiable >=80 branch coverage (`100%`) for `loop.sh`; however, the proof gate still expects additional named artifacts not currently present in workspace.
  - Source: command run `cd aloop/cli && cd ../bin && bash loop_branch_coverage.tests.sh coverage/shell-branch-coverage.json` (T2), `coverage/shell-branch-coverage.json:1-6` (T2), command run `glob "**/{dashboard-dead-pid-proof.json,triage-steering-proof.json,loop-exit-state-proof.txt}"` (no matches) (T2)

## 2026-03-14 14:06Z — Planning recheck: status/watch coverage + runtime-state nuance [T2+T3]

- `aloop status --watch` is already implemented (2s refresh loop with terminal re-render), so this acceptance item is not a current blocker.
  - Source: `aloop/cli/src/commands/status.ts:11,87-103` (T2 — direct inspection), `SPEC.md:925` (T3)
- Runtime exit-state behavior is partially aligned but still non-compliant on success paths: both loop scripts emit `stopped` for manual/limit exits, but still write `completed` on successful completion where spec requires `stopped`/`exited` semantics.
  - Source: `aloop/bin/loop.sh:1534,1667` (T2), `aloop/bin/loop.ps1:1672,1774,1815,1824` (T2), `SPEC.md:900-924` (T3)
- GH command surface remains policy-only (request/since operations) and still does not expose high-level workflow entrypoints `aloop gh start|watch|status|stop`.
  - Source: `aloop/cli/src/commands/gh.ts:48-58` (T2 — direct inspection), `SPEC.md:1290-1364,1418-1431` (T3)

## 2026-03-14 14:19Z — Planning recheck: dashboard/GH parity and evidence drift [T2+T3]

- Proof artifacts previously flagged missing are now present in the repo root, so the proof-artifact presence gate is no longer a blocker.
  - Source: command run `glob "**/{dashboard-dead-pid-proof.json,triage-steering-proof.json,loop-exit-state-proof.txt}"` (matches all three files) (T2)
- GH command surface is still policy-level only (`pr-create`, `issue-label`, `issue-comments`, etc.) and still does not implement high-level `aloop gh start|watch|status|stop` workflows required by spec.
  - Source: `aloop/cli/src/commands/gh.ts:49-58` (T2 — direct inspection), `SPEC.md:1294-1366,1422-1433` (T3)
- `gh.ts` branch coverage remains below the file-level gate target for touched code (`78.46%` branches), despite all `gh.test.ts` tests passing.
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (coverage report line `gh.ts ... branch % 78.46`) (T2), review gate target in `TODO.md` current phase (T3)
- `aloop status` still renders only flat active sessions plus provider health and does not show orchestrator→child issue/PR tree data.
  - Source: `aloop/cli/src/commands/status.ts:44-70` (T2 — direct inspection), `SPEC.md:1205,1275` (T3)
- Dashboard parity gaps remain open: header uses wrapping flex layout, provider/model are not shown together, and docs tabs are not filtered for non-empty content.
  - Source: `aloop/cli/dashboard/src/App.tsx:295,359,382-384,572-589` (T2 — direct inspection), `SPEC.md:878-882,919-924` (T3)
- Pipeline config/mutation surfaces are still absent (`.aloop/pipeline.yml` and `.aloop/agents/` not found), so configurable agent pipeline work remains open.
  - Source: command run `glob "**/.aloop/pipeline.yml"` (no matches) and `glob "**/.aloop/agents/**"` (no matches) (T2), `SPEC.md:2211-2225,2318-2323` (T3)
- Branch-evidence parity for PowerShell is now materially present via `loop.tests.ps1` generating `coverage/ps1-proof-branch-coverage.json` targeting `aloop/bin/loop.ps1` at `>=80%` threshold, reducing urgency of a dedicated "add ps1 branch-evidence gate" task.
  - Source: `aloop/bin/loop.tests.ps1:816-855` (T2 — direct inspection)

## 2026-03-14 15:45Z — Planning recheck: exit-state parity resolved; dashboard steering not yet applied to code [T2+T3]

- Loop exit-state parity is NOW COMPLIANT: both `loop.sh` and `loop.ps1` emit `exited` for success paths and `stopped` for limit/interrupt exits. `stuck_count` resets on successful build iterations (not just skip paths). The earlier research entries flagging this as non-compliant are superseded by commits `ca10e4a` and `13a993c`.
  - Source: `aloop/bin/loop.sh:1534,1617,1633,1667` (T2), `aloop/bin/loop.ps1:1672,1759,1774,1815,1824` (T2)
- Steering commits `8719b63` (provider health sidebar) and `ffd05fe` (header grid layout) only modified `SPEC.md` and `TODO.md` — they did NOT touch dashboard source code (`App.tsx`). The dashboard still uses flex-wrap layout (line 295) and provider health is still inline in the header (lines 382-384), not in a sidebar tab.
  - Source: `git show 8719b63 --stat` (only SPEC.md, TODO.md changed) (T2), `git show ffd05fe --stat` (only SPEC.md, TODO.md changed) (T2), `aloop/cli/dashboard/src/App.tsx:295,382-384` (T2 — direct inspection)
- `gh.ts` branch coverage remains at 78.46%. Key untested branches: remove-label path (line 162), issue-create without labels (lines 142-144), `childCreatedPrNumbers` fallback (lines 228-234), `parseGhOutput` error handling (lines 324-325), `evaluatePolicy` default return (lines 368-369).
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (branch % 78.46) (T2)
- Docs panel filters out `TODO.md` by name and returns null when no docs exist, but does NOT filter docs with empty string content. Spec requires filtering non-empty.
  - Source: `aloop/cli/dashboard/src/App.tsx:572-573,585` (T2 — direct inspection)
- Proof artifacts are present and no longer blocking: `dashboard-dead-pid-proof.json`, `triage-steering-proof.json`, `loop-exit-state-proof.txt` all exist.
  - Source: previous research entry 14:19Z confirmed (T2)
- Dead-PID liveness correction in dashboard is implemented via `withLivenessCorrectedState()`.
  - Source: `aloop/cli/src/commands/dashboard.ts:187-198` (T2 — direct inspection)
