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
- `aloop status` remains flat session/health output and does not yet render orchestrator tree (orchestrator -> child sessions -> issue/PR tree data).
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

## 2026-03-14 16:00Z — Planning recheck: post-merge state — GH workflows landed, dashboard partially fixed, coverage still below gate [T2+T3]

### Dashboard state — supersedes 15:45Z findings

- Dashboard header NOW uses CSS grid layout (line 298: `className="grid items-center gap-x-3 gap-y-2 [grid-template-columns:...]"`). The earlier 15:45Z finding about flex-wrap is superseded.
  - Source: `aloop/cli/dashboard/src/App.tsx:298` (T2 — direct inspection)
- Provider+model ARE shown together in header (line 388: `providerName/modelName` format).
  - Source: `aloop/cli/dashboard/src/App.tsx:388` (T2 — direct inspection)
- Docs panel NOW filters empty content at the individual DocEntry level (line 620: `{content && (...)}`). Panel-level filtering for empty doc lists also exists (line 579).
  - Source: `aloop/cli/dashboard/src/App.tsx:579,620` (T2 — direct inspection)
- Provider health is NOT in a sidebar tab — still only shows provider name inline in header. No separate health panel/tab exists.
  - Source: `aloop/cli/dashboard/src/App.tsx:387-390` (T2 — direct inspection)
- No per-iteration timing/duration shown in artifact gallery rows (lines 920-927 show iteration number + artifact count only). No session elapsed/total iterations/average duration in header.
  - Source: `aloop/cli/dashboard/src/App.tsx:341,366,920-927` (T2 — direct inspection)

### GH workflow commands — now implemented

- All four high-level GH workflow commands exist: `start` (line 904), `watch` (line 939), `status` (line 958), `stop` (line 967).
  - Source: `aloop/cli/src/commands/gh.ts:904,939,958,967` (T2 — direct inspection)
- Watch-cycle completion finalization gap: `refreshWatchState()` (lines 373-403) detects running→completed transitions by reading session state, but does NOT create PRs or post issue summary comments for sessions that completed after launch (where `pending_completion` was true at start time).
  - Source: `aloop/cli/src/commands/gh.ts:373-403,925-926` (T2 — direct inspection)
- Missing feedback signals: no `@aloop` mention detection, no manual trigger handling, no review-change semantics, no CI failure log context ingestion. PR feedback loop only checks review comments + check run conclusions.
  - Source: grep for `@aloop|manual.trigger|review.change|CI.failure.detail` in gh.ts returned 0 matches (T2), `aloop/cli/src/commands/gh.ts:552-614,617-675` (T2 — direct inspection)
- No `gh stop-watch` command or equivalent documented — `gh stop` stops individual issues/all tracked, but no command to stop the watch daemon itself (relies on SIGINT/SIGTERM).
  - Source: `aloop/cli/src/commands/gh.ts:755-778,967-975` (T2 — direct inspection)

### Type-check regression — still present

- `npm run type-check` still fails with 5 TS2345 errors in `gh.test.ts` at lines 1937, 1953, 1964, 2032, 2050. Root cause: `buildWatchEntry()` helper (line 1889) returns `status: string` instead of `GhWatchIssueStatus` type.
  - Source: command run `cd aloop/cli && npx tsc --noEmit` (T2)

### Branch coverage — still below gate

- `gh.ts` branch coverage is at 65.80% (gate target: >=80%). Key uncovered branches: lines 16-18, 24, 28-29, 32-33, 51, 54, 58, 100-101, 183-184, 226-227, 241-249, 274-279, 311-316, 370-375, 440, 515-516, 522-544, 587, 592-593, 603, 618-619, 626-627, 637-641, 696-718, 828-834, 914, 927, 968, 1085-1087, 1107, 1193-1199, 1258-1259, 1284-1287, 1304, 1323-1324.
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (branch % 65.80) (T2)
- Tests for remove-label path (line 727) and parseGhOutput error/fallback (lines 841, 869) DO exist now. But many new branches from `start/watch/status/stop` commands remain untested.
  - Source: `aloop/cli/src/commands/gh.test.ts:727,841,869` (T2 — direct inspection)

### Dead code — still present

- `fetchPrReviewComments` (lines 488-515): `response` variable assigned from `/reviews` API call at line 489 but never referenced. Only `commentsResponse` (line 495) is used.
  - Source: `aloop/cli/src/commands/gh.ts:489-492` (T2 — direct inspection)

### Playwright config — Windows path separators

- `playwright.config.ts` line 18: webServer command uses backslash path separators (`..\\dist\\index.js`, `.\\e2e\\fixtures\\session`, etc.) which fail on Linux with `MODULE_NOT_FOUND`.
  - Source: `aloop/cli/dashboard/playwright.config.ts:17-18` (T2 — direct inspection)

### Pipeline — not yet implemented

- loop-plan.json compiler does not exist. `loop.sh` lines 360-391 still use hardcoded phase cycle logic with modulo calculations.
  - Source: `aloop/bin/loop.sh:360-391` (T2 — direct inspection), glob for `**/loop-plan.json` (no matches) (T2)

### Proof manifest iter 43

- Iteration 43 proof artifacts (`gh-help.txt`, `gh-status-text.txt`, `gh-status-json.json`, `gh-stop-all-success.json`, `gh-status-after-stop.txt`, `dashboard-api-state.json`, `dashboard-server.log`, `gh-stop-json.json`) remain missing. Iteration 45 proof artifacts are present.
  - Source: glob for `**/{gh-help.txt,gh-status-text.txt,dashboard-api-state.json}` (no matches) (T2)

## 2026-03-14 17:45Z — Planning recheck: dead code resolved, dashboard/GH/pipeline gaps remain [T2+T3]

### Dead code — resolved

- The previously flagged dead code in `fetchPrReviewComments` (unused `response` from `/reviews` API) has been removed. Function at line ~489 no longer has the unused assignment.
  - Source: `aloop/cli/src/commands/gh.ts:489` (T2 — direct inspection via subagent)

### Dashboard — remaining gaps vs spec

- **Provider health NOT in sidebar tab**: Provider info is still inline in the header grid (lines 385-389). Spec §6 requires it to be in a "dedicated left-pane tab" to reduce header overload. No sidebar tab structure exists.
  - Source: `aloop/cli/dashboard/src/App.tsx:385-389` (T2 — direct inspection), `SPEC.md:794,798,839` (T3)
- **No per-iteration duration**: Iteration/artifact gallery rows (lines 920-930) show iteration number + artifact count only, no duration. Spec §6 requires per-iteration duration in log rows and average duration in header.
  - Source: `aloop/cli/dashboard/src/App.tsx:920-930,341,366` (T2 — direct inspection), `SPEC.md:796,805,846-847` (T3)
- **No sidebar expand/collapse button**: No sidebar toggle button exists at all. Spec §6 requires it vertically centered with header title row.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — subagent searched, no match), `SPEC.md:804,845` (T3)
- **No overflow ellipsis menu for docs**: Docs panel filters empty content (resolved) but does not overflow large doc sets into an `...` menu.
  - Source: `aloop/cli/dashboard/src/App.tsx:568-630` (T2 — direct inspection), `SPEC.md:806,849` (T3)
- **No commit diffstat/change-type badges**: No per-file M/A/D/R markers in commit detail views.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — no commit detail component found), `SPEC.md:797,848` (T3)

### GH workflow — remaining gaps vs spec

- **No `@aloop` mention detection**: `gh.ts` has no code for detecting `@aloop` mentions in PR/issue comments as a re-trigger signal.
  - Source: grep for `@aloop|mention|trigger` in `gh.ts` (T2 — no matches), `SPEC.md:1808` (T3)
- **No CI failure log ingestion**: No `gh run view --log-failed` call exists. PR feedback loop checks review comments + check run conclusions but does not extract CI failure logs for steering.
  - Source: grep for `log-failed|run view|CI failure` in `gh.ts` (T2 — no matches), `SPEC.md:1821-1837` (T3)
- **No `gh stop-watch` command**: Watch daemon relies on SIGINT/SIGTERM only; no dedicated `stop-watch` subcommand.
  - Source: `aloop/cli/src/commands/gh.ts:967-975` (T2 — `stop` command stops issues, not watch daemon), `SPEC.md:1769` (T3)
- **Watch-cycle completion finalization**: `refreshWatchState()` detects running→completed transitions but does NOT create PRs or post issue summary comments for sessions that completed after launch.
  - Source: `aloop/cli/src/commands/gh.ts:373-403` (T2 — direct inspection), `SPEC.md:1767` (T3)

### Pipeline — still not implemented

- `loop-plan.json` compiler does not exist. `loop.sh` lines 360-376 still use hardcoded phase cycle logic with modulo-based `CYCLE_POSITION % 6` calculations. Not reading from any compiled plan file.
  - Source: `aloop/bin/loop.sh:360-376` (T2 — direct inspection via subagent), glob for `**/loop-plan.json` (no matches) (T2)
- No `.aloop/pipeline.yml` or `.aloop/agents/` directory exists.
  - Source: glob for `**/pipeline.yml` and `**/.aloop/agents/**` (no matches) (T2)
- Spec requires inner loop to "Read `loop-plan.json` each iteration, pick agent at `cyclePosition % cycle.length`" — currently loop scripts hardcode the cycle.
  - Source: `SPEC.md:35-38` (T3)

### Status tree — still flat

- `aloop status` (status.ts) renders flat active sessions + provider health. No orchestrator→child session→issue/PR tree rendering.
  - Source: `aloop/cli/src/commands/status.ts:44-70` (T2 — prior research confirmed, no new changes detected)

### Branch coverage — still below gate

- `gh.ts` branch coverage remains at ~65.80%, well below the >=80% gate target. Many uncovered branches from start/watch/status/stop command paths.
  - Source: prior research entry 16:00Z (T2), no new test additions detected

## 2026-03-14 18:50Z — Gap analysis: Start/resume logic, GH Actions decomposition, Spec parity [T2+T3]

### CLI Resume Bug — Confirmed
- `aloop start <session-id> --launch resume` is broken. The `start.ts` script handles `--launch resume` by assigning it to `launchMode`, but then still blindly generates a *new* session ID via `resolveSessionId` and creates a fresh session directory. It does not look up the existing session to reuse its worktree or branch.
  - Source: `aloop/cli/src/commands/start.ts:627-635` (T2 — direct inspection)

### Orchestrator / GH Actions — Gap
- Decomposition agents do not include "Set up GitHub Actions CI" as an early foundation task. There is no mention of `GitHub Actions` or workflows in `orchestrate.ts` or the `aloop/templates/` prompt files.
  - Source: grep for `GitHub Actions` in `aloop/cli/src/commands/orchestrate.ts` and `aloop/templates/` returned 0 hits (T2)

### Spec Parity — Resolved
- The architecture drift regarding `.mjs` and zero npm deps has been resolved in the spec itself. `SPEC.md` was updated (commit `739d26c`) to officially document `TypeScript / Bun` as the standard, removing the outdated constraints. This task is completed.
  - Source: `git log -S "zero npm deps"` and `SPEC.md` (T1/T3)

### Proof Manifest Iter 43 — Still Missing
- Artifacts required for iteration 43 (`gh-help.txt`, `gh-status-text.txt`, etc.) are still absent from the project.
  - Source: glob for `**/{gh-help.txt,gh-status-text.txt,gh-status-json.json,gh-stop-all-success.json,gh-status-after-stop.txt,dashboard-api-state.json,dashboard-server.log,gh-stop-json.json}` returned no matches (T2)

## 2026-03-14 17:58Z — Gap analysis: setup parity + dashboard command artifacts [T2+T3]

### `aloop setup` parity gaps — confirmed
- Interactive setup currently prompts for spec/providers/language/provider/mode/validation/safety only; it does **not** auto-detect `.github/workflows`, check Actions support, or ask about quality-gate workflow setup as required by spec.
  - Source: `aloop/cli/src/commands/setup.ts:49-71` (T2 — direct inspection), `SPEC.md:676-679` (T3)
- Setup does not currently expose explicit loop/orchestrator mode selection in CLI options for non-interactive use (`--mode loop|orchestrate`); command wiring only includes `--spec`, `--providers`, and `--non-interactive`.
  - Source: `aloop/cli/src/commands/setup.ts:4-10` and `aloop/cli/src/index.ts:39-46` (T2 — direct inspection), `SPEC.md:684-687` (T3)

### Dashboard command/prompt files — present
- The spec-required dashboard command files exist: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`.
  - Source: glob matches `claude/**/dashboard.md` and `copilot/**/aloop-dashboard.prompt.md` (T2), `SPEC.md:856-857` (T3)

## 2026-03-14 19:15Z — Planning recheck: loop-plan frontmatter landed, @aloop/CI-log landed, review gates still open [T2+T3]

### Loop Script — Cycle Resolution Landed, Queue/Requests Still Missing

- `loop.sh` now reads `loop-plan.json` and resolves cycle prompts via frontmatter (commit `2d119ab`). `parse_frontmatter()` exists at line ~459. `LOOP_PLAN_FILE` defined at line ~227.
  - Source: `aloop/bin/loop.sh:227,459,1600,1665` (T2 — direct inspection)
- **queue/ folder check is NOT implemented** in either `loop.sh` or `loop.ps1`. No references to `queue/`, `queue_dir`, or `QUEUE` found.
  - Source: grep for `queue/|queue_dir|QUEUE` in `aloop/bin/loop.sh` returned 0 matches (T2)
- **requests/ wait loop is NOT implemented** in either script. No references to `requests/`, `REQUESTS`, or `request_dir` found.
  - Source: grep for `requests/|REQUESTS|request_dir` in `aloop/bin/loop.sh` returned 0 matches (T2)
- Spec requires both queue/ check (SPEC.md:35) and requests/ wait (SPEC.md:42) as inner loop responsibilities.
  - Source: `SPEC.md:35,42` (T3)

### GH Workflow — @aloop Mention + CI Log Ingestion Landed

- `@aloop` mention detection implemented at `gh.ts:643` — filters issue comments by `body.toLowerCase().includes('@aloop')`.
  - Source: `aloop/cli/src/commands/gh.ts:643` (T2 — direct inspection), commit `4caa6ca` (T2)
- CI failed-log ingestion implemented via `fetchFailedCheckLogs()` at `gh.ts:550-573` — calls `gh run view <id> --repo <repo> --log-failed`.
  - Source: `aloop/cli/src/commands/gh.ts:550-573` (T2 — direct inspection), commit `4caa6ca` (T2)

### Review Gates — Status Update

- **Gate 1**: [FIXED] `completion_finalized` is now only set if `finalizeWatchEntry()` returns `true`. The return type of `finalizeWatchEntry()` was changed from `void` to `boolean` to indicate success (PR created/found and issue commented).
  - Source: `aloop/cli/src/commands/gh.ts:833,972-975` (T2 — direct inspection), commit `c3295ee` (T2)
- **Gate 2**: Tests for `@aloop` mention detection and CI failed-log ingestion are still absent. `gh.test.ts` tests at lines 1943-2068 pass empty `[]` for issue comments and don't exercise mention filtering. No `fetchFailedCheckLogs` unit tests or >200-line truncation assertions.
  - Source: `aloop/cli/src/commands/gh.test.ts:1943-2068` (T2 — direct inspection)
- **Gate 3**: Branch coverage at 63.32% (c8 report), well below the >=80% target. Many untested branches from start/watch/status/stop commands.
  - Source: command run `cd aloop/cli && npx c8 --all --include=src/commands/gh.ts tsx --test src/commands/gh.test.ts` (branch % 63.32) (T2)
- **Gate 6**: Proof manifest artifacts (`gh-test-output.txt`, `derive-mode-test.txt`, `cycle-resolution-test.txt`, `frontmatter-parse-test.txt`, `cycle-integration-test.txt`, `aloop-mention-grep.txt`) not found in workspace.
  - Source: grep for these filenames returned 0 matches (T2)

### CLI Resume — Fixed

- `aloop start <session-id> --launch resume` now properly reuses existing session worktree/branch (commit `607edaa`).
  - Source: commit `607edaa` (T2)

## 2026-03-14 20:20 — Gap analysis: Loop Script Completion + Orchestrator Implementation [T1+T2+T3]

- `loop.sh` and `loop.ps1` **now implement** `queue/` folder check and `requests/` wait loop.
  - Source: `aloop/bin/loop.sh:1684-1731`, `aloop/bin/loop.ps1:1779-1857` (T2 — direct inspection).
- `gh.ts` branch coverage is now **81.59%**, meeting Gate 3 (>80%).
  - Source: ran `node --import tsx --test --experimental-test-coverage src/commands/gh.test.ts` (T2).
- `aloop/bin/loop_branch_coverage.tests.sh` **is missing** registrations and tests for:
  - `queue.override_success`, `queue.override_failure`, `queue.provider_fallback`
  - `requests.wait_drain`, `requests.timeout`
  - `invoke.opencode` (only `claude` and `unsupported` are currently tested).
  - Source: `aloop/bin/loop_branch_coverage.tests.sh:58-80` (T2 — direct inspection).
- Proof artifacts for iteration 11 (`gh-test-output.txt`, `derive-mode-test.txt`, `cycle-resolution-test.txt`, `frontmatter-parse-test.txt`, `cycle-integration-test.txt`, `aloop-mention-grep.txt`) **are missing** from the workspace.
  - Source: `ls` returned empty (T2).


## 2026-03-15 10:10 — Gap analysis: Loop scripts, requests, and dashboard UX [T2+T3]

- `loop.sh` and `loop.ps1` exit states:
  - Success paths write `state: "completed"` instead of `state: "exited"`.
  - Interrupt/limit paths write `state: "interrupted"` or `state: "limit_reached"` instead of `state: "stopped"`.
  - Source: `aloop/bin/loop.sh:1829,1928,1964`, `aloop/bin/loop.ps1:1945,2047,2090,2099` (T2 — direct inspection), `SPEC.md:900-924` (T3)
- `STUCK_COUNT` reset logic:
  - `loop.sh` resets `STUCK_COUNT` to 0 only when a task is marked as blocked (skipped), not after a successful iteration.
  - Source: `aloop/bin/loop.sh:1313` (T2 — direct inspection), `SPEC.md:922` (T3)
- `UpdateIssueRequest` interface bug:
  - `UpdateIssueRequest.payload` lacks the `title` field, but `handleUpdateIssue` in `requests.ts` attempts to use it.
  - Source: `aloop/cli/src/lib/requests.ts:46,307` (T2 — direct inspection)
- Dashboard UX gaps (SPEC §6):
  - Provider health is still inline in the header, not in a dedicated left-pane sidebar tab.
  - No per-iteration duration or timing aggregates (elapsed, total iterations, avg duration) in log rows or header.
  - No sidebar expand/collapse toggle button.
  - No overflow ellipsis menu for large sets of documentation tabs.
  - No `M/A/D/R` change type badges in commit detail view (commit detail view itself is missing).
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — direct inspection), `SPEC.md:794-806,839-849` (T3)
- Test coverage gaps (Gate 3):
  - `requests.ts` branch coverage is at 52.5%.
  - `plan.ts` branch coverage is at 40%.
  - Source: `TODO.md` (T3)
- Missing proof artifacts for iteration 11: `gh-test-output.txt`, `derive-mode-test.txt`, `cycle-resolution-test.txt`, `frontmatter-parse-test.txt`, `cycle-integration-test.txt`, `aloop-mention-grep.txt`.
  - Source: `ls` (T2 — confirmed missing)

## 2026-03-15 11:15 — Gap analysis: Dashboard UX, coverage gates, and pipeline infrastructure [T2+T3]

- `orchestrate.test.ts` has a duplicate `import path from 'node:path'` at line 3 and line 2408, causing a TS2300 compiler error.
  - Source: `aloop/cli/src/commands/orchestrate.test.ts:3,2408` (T2 — direct inspection)
- Dashboard header lacks session timing aggregates: no elapsed duration since `session_start`, total iteration count, or average iteration duration.
  - Source: `aloop/cli/dashboard/src/App.tsx:550-600` (T2 — direct inspection), `SPEC.md §6` (T3)
- Dashboard sidebar toggle is at the top of the sidebar, not vertically centered with the header title row as required.
  - Source: `aloop/cli/dashboard/src/App.tsx:350-450` (T2 — direct inspection), `SPEC.md §6` (T3)
- Provider health remains inline in the header grid; not yet moved to the required dedicated left-pane sidebar tab.
  - Source: `aloop/cli/dashboard/src/App.tsx:385-389` (T2 — direct inspection), `SPEC.md §6` (T3)
- Documentation tabs in the dashboard do not have an overflow ellipsis menu for large sets of documents.
  - Source: `aloop/cli/dashboard/src/App.tsx:568-600` (T2 — direct inspection), `SPEC.md §6` (T3)
- `stuck_count` is missing from the dashboard status/details view.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — direct inspection), `TODO.md` (T3)
- `plan.ts` branch coverage is at 40%. Uncovered branches at lines 14, 19-21, 47-49, 51.
  - Source: `npx tsx --test --experimental-test-coverage src/lib/plan.test.ts` (T2)
- `requests.ts` branch coverage is at 57.38%. Uncovered branches include error paths for steer, backfill, dispatch, and stop.
  - Source: `npx tsx --test --experimental-test-coverage src/lib/requests.test.ts` (T2)
- `.aloop/pipeline.yml` and `.aloop/agents/` directory are missing from the project root.
  - Source: `ls` (T2 — direct inspection), `SPEC.md §Configurable Agent Pipeline` (T3)
- Iteration 11 proof artifacts are missing from the workspace.
  - Source: `ls` (T2 — direct inspection)

## 2026-03-15 12:45 — Gap analysis: plan.ts coverage, dashboard UX, and code duplication [T2+T3]

- `plan.ts` branch coverage remains at 73.91% (goal: >=80%). Uncovered branches at lines 58, 61-64 (`cycle`, `iteration`, `allTasksMarkedDone`, `forceReviewNext`, `forceProofNext`).
  - Source: `npx tsx --test --experimental-test-coverage src/lib/plan.test.ts` (T2)
- Dashboard header is missing `stuck_count` and session timing aggregates (elapsed since start, total iterations, avg duration).
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — direct inspection)
- `stuck_count` is not extracted from session status in `App.tsx` and not passed to `Header` or displayed in status/details.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — direct inspection)
- Copy-paste duplication confirmed in `aloop/cli/src/commands/dashboard.ts:247-264` for PID lookup from `meta.json` and `active.json`.
  - Source: `aloop/cli/src/commands/dashboard.ts:247-264` (T2 — direct inspection)
- `UpdateIssueRequest.payload.title` bug is confirmed fixed in code, and duplicate import in `orchestrate.test.ts` is also fixed.
  - Source: `aloop/cli/src/lib/requests.ts` and `aloop/cli/src/commands/orchestrate.test.ts` (T2 — direct inspection)
- `loop.sh` correctly resets `STUCK_COUNT` to 0 on successful iteration.
  - Source: `aloop/bin/loop.sh:1893` (T2 — direct inspection)
- Dashboard docs panel does not filter out empty documentation files, only checks for existence. Spec requires "Only tabs with non-empty content shown".
  - Source: `aloop/cli/dashboard/src/App.tsx:595` (T2 — direct inspection)
- Provider health tab exists in `DocsPanel`, but `TODO.md` and steering require moving it to a dedicated sidebar tab.
  - Source: `aloop/cli/dashboard/src/App.tsx:605-607` (T2), `TODO.md` (T3)

## 2026-03-15 13:00 — [review] Gate 4 completion: extract PID lookup helper [T2]

- PID lookup duplication in `dashboard.ts:247-264` has been extracted into a `resolvePid` helper function.
- `loadStateForContext` now calls `resolvePid` to handle multi-source PID resolution (context -> meta.json -> active.json) with liveness checking.
- Verified with `npx tsx --test src/commands/dashboard.test.ts` (38/38 pass) and `npm run type-check`.
  - Source: `aloop/cli/src/commands/dashboard.ts:230-254` (T2 — direct inspection)

## 2026-03-15 14:30 — Gap analysis: review gate status, dashboard UX completion, and P2 pipeline/orchestrator readiness [T2+T3]

### Stale TODO corrections — items now resolved

- **`stuck_count` visibility**: Fully implemented in `App.tsx`. Extracted at line 150 and 1292, displayed in sidebar tooltip (line 544), header HoverCard (line 639), StatusDot (lines 274-275). TODO item is stale — can be marked complete.
  - Source: `aloop/cli/dashboard/src/App.tsx:150,544,639,1292` (T2 — direct inspection)
- **Session elapsed context / avg duration**: Implemented. `startedAt` extracted at line 1294, `avgDuration` computed via `computeAvgDuration` at line 1295, both passed to Header at line 1342.
  - Source: `aloop/cli/dashboard/src/App.tsx:1294-1295,1342` (T2 — direct inspection)
- **Docs overflow ellipsis menu**: Implemented with `MAX_VISIBLE_TABS = 4` at line 693, overflow tabs at line 695, dropdown menu at lines 712-726.
  - Source: `aloop/cli/dashboard/src/App.tsx:693-726` (T2 — direct inspection)
- **PID lookup duplication**: Resolved — `resolvePid` helper extracted (dashboard.ts:229-254).
  - Source: `aloop/cli/src/commands/dashboard.ts:229-254` (T2 — direct inspection)
- **Duplicate import in orchestrate.test.ts**: Fixed (confirmed by prior review log entry).
  - Source: `REVIEW_LOG.md` review 2026-03-15 10:15 (T2)

### Open review gates — confirmed still failing

- **Gate 2: Dashboard UI tests missing**: No unit tests for `iteration_running` synthetic entry, `output.txt` fetch/render, output-header model extraction, "No output available" fallback. `App.tsx` has 1371 lines of complex logic with zero test coverage.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2 — no test file exists for App.tsx)
- **Gate 2: Dashboard backend tests missing for new branches**: `dashboard.test.ts` has 38 tests but does not cover `loadArtifactManifests` with missing manifest + present `output.txt`, `resolvePid` fallback to `active.json`, or active-session `status.json` enrichment.
  - Source: `aloop/cli/src/commands/dashboard.test.ts` (T2 — direct inspection)
- **Gate 2: E2E tests broken**: `smoke.spec.ts` uses outdated selectors from pre-rewrite UI.
  - Source: `aloop/cli/dashboard/e2e/smoke.spec.ts` (T2 — direct inspection)
- **Gate 3: Branch coverage for `dashboard.ts` and `App.tsx`**: No branch-coverage report exists for these files. They were touched this iteration but coverage evidence is missing.
  - Source: `coverage/` directory listing (T2 — no dashboard coverage file found)
- **Gate 6: Proof manifest references missing artifacts**: Multiple artifacts referenced in proof manifests don't exist in the workspace.
  - Source: `TODO.md` (T3), prior review findings (T2)

### Provenance tagging — not implemented

- Neither `loop.sh` nor `loop.ps1` add `Aloop-Agent`, `Aloop-Iteration`, or `Aloop-Session` trailers to commits. Grep for these strings returned 0 hits.
  - Source: `aloop/bin/loop.sh` (T2 — grep returned no matches)

### Pipeline infrastructure — not started

- No `.aloop/pipeline.yml` schema or file exists.
- No `.aloop/agents/` directory with agent YAML definitions.
- `compile-loop-plan.ts` reads hardcoded cycle arrays, not pipeline YAML.
  - Source: `aloop/cli/src/commands/compile-loop-plan.ts` (T2 — direct inspection)

### Orchestrator prompt templates — not started

- No `PROMPT_orch_*.md` files exist in `aloop/templates/`. Only `PROMPT_plan.md`, `PROMPT_build.md`, `PROMPT_proof.md`, `PROMPT_review.md`, `PROMPT_setup.md`, `PROMPT_steer.md`.
  - Source: `aloop/templates/` directory listing (T2)

### `aloop gh stop-watch` — not implemented

- `gh stop` stops individual sessions or all with `--all` flag. No dedicated `stop-watch` subcommand to stop the watch daemon specifically.
  - Source: `aloop/cli/src/commands/gh.ts` (T2 — direct inspection)
