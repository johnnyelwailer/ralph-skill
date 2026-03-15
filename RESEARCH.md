# Research Log

## 2026-03-15 15:29Z — P0 research decision: GitHub-native progression with minimal-label fallback [T3+T2]

- Decision finalized: issue progression is represented by **Project status + issue state** (`open/closed`) as primary truth; progression labels are not required for normal state transitions.
- Required minimal labels retained where native signals are insufficient:
  - `aloop` (single tracker scope label for orchestrator-owned issues)
  - `aloop/spec-question` (blocking clarification artifact)
  - `aloop/blocked-on-human` (explicit human-blocked condition)
  - `aloop/auto-resolved` (autonomy-resolution provenance)
  - `aloop/wave-*` (scheduling metadata, not progression)
- Implementation alignment completed in this iteration:
  - Orchestrator issue creation now uses `aloop` + `aloop/wave-*` labels (removed `aloop/auto` issuance).
  - GH policy enforcement now validates an `aloop` tracking scope (with legacy acceptance of `aloop/auto` for compatibility).
  - Request processor defaults switched from `aloop/auto` to `aloop` for issue-create/issue-close scoping.
  - Tests updated to assert `aloop` tracking behavior.

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
  - Source: `aloop/cli/src/commands/stop.ts" (T2 — direct inspection)
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
  - Source: `aloop/cli/src/commands/gh.ts" and `gh.test.ts` (T2 — direct inspection)

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
  - Source: `aloop/cli/dashboard/src/App.tsx:207,359,381-384,399-402,572-586` (T2), steering intent in `TODO.md" current phase (T3)
- Runtime exit-state gap remains in shell loop implementation: `status.json` writes `completed`, `interrupted`, and `limit_reached` states; no `stopped`/`exited` state currently emitted, and stuck counter reset is tied to skip handling rather than successful iteration completion.
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
  - Source: `aloop/cli/dashboard/package.json:7-9,34-40" (T2)

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
  - Source: `aloop/cli/src/commands/dashboard.ts:556-589,664-677` (T2), `aloop/cli/dashboard/src/App.tsx:207,359,382-384,572-586` (T2), `SPEC.md:900,917-920" (T3)
- GH workflow surface remains incomplete versus spec: `gh.ts` exposes low-level policy commands (including triage helpers) but still lacks `aloop gh start/watch/status/stop` orchestration commands.
  - Source: `aloop/cli/src/commands/gh.ts:48-58` (T2), `SPEC.md:1290-1361,1418-1428` (T3)
- Pipeline config model from spec is still not present in-repo (`.aloop/pipeline.yml`, `.aloop/agents/` missing).
  - Source: command run `glob "**/pipeline.yml"` (no matches) and `glob "**/.aloop/agents/**"` (no matches) in repo root (T2), `SPEC.md:2314-2317` (T3)
- `gh.ts` targeted branch-coverage gaps likely remain in tests: no evidence of `issue-label` remove-path assertions or parser error/fallback-path tests.
  - Source: command run `rg "(--remove-label|label_action:\\s*'remove'|Unknown operation|Cannot build gh args|gh_operation_error)" aloop/cli/src/commands/gh.test.ts -n" (no matches) (T2)

## 2026-03-14 14:05Z — Planning recheck: newly landed fixes vs remaining parity gaps [T2+T3]

- Previously open triage-loss gap is now fixed: actionable comments with no `child_session` are queued as deferred steering (`steering_deferred` + `pending_steering_comments`) and flushed when a child session appears.
  - Source: `aloop/cli/src/commands/orchestrate.ts:630-707` (T2 — direct inspection), `aloop/cli/src/commands/orchestrate.test.ts:1040-1102` (T2 — direct inspection)
- Dashboard dead-PID auto-correction is now implemented in state loading/publish path via liveness probing (`process.kill(pid, 0)` + `withLivenessCorrectedState()`).
  - Source: `aloop/cli/src/commands/dashboard.ts:177-225` (T2 — direct inspection)
- Runtime exit-state parity is still incomplete vs spec: loop scripts still write `state: "completed"` on successful completion paths, while spec requires exit reporting as `stopped`/`exited`.
  - Source: `aloop/bin/loop.sh:1534,1633` (T2), `aloop/bin/loop.ps1:1672,1774` (T2), `SPEC.md:900-924` (T3)
- `gh.ts` branch coverage remains at 78.46%. Key uncovered branches identified.
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (branch % 78.46) (T2)
- High-level GH workflow commands remain missing from `gh.ts` (`start`, `watch`, `status`, `stop` command surface not present).
  - Source: `aloop/cli/src/commands/gh.ts:48-58` (T2), command run `rg "command\\('start'\\)|command\\('watch'\\)|command\\('status'\\)|command\\('stop'\\)" aloop/cli/src/commands/gh.ts -n" (no matches) (T2), `SPEC.md` GH workflow sections (T3)
- Dashboard UI parity gaps remain: header still uses wrapping flex layout (not required grid), provider/model are not shown together, and docs tab list still includes all non-TODO doc keys without non-empty filtering or overflow menu behavior.
  - Source: `aloop/cli/dashboard/src/App.tsx:295,359,382-384,399-402,572-589` (T2), `SPEC.md:918-923" (T3)
- Loop branch-evidence state: shell harness now produces verifiable >=80 branch coverage (`100%`) for `loop.sh`; however, the proof gate still expects additional named artifacts not currently present in workspace.
  - Source: command run `cd aloop/cli && cd ../bin && bash loop_branch_coverage.tests.sh coverage/shell-branch-coverage.json` (T2), `coverage/shell-branch-coverage.json:1-6` (T2), command run `glob "**/{dashboard-dead-pid-proof.json,triage-steering-proof.json,loop-exit-state-proof.txt}"` (no matches) (T2)

## 2026-03-14 14:06Z — Planning recheck: status/watch coverage + runtime-state nuance [T2+T3]

- `aloop status --watch` is already implemented (2s refresh loop with terminal re-render), so this acceptance item is not a current blocker.
  - Source: `aloop/cli/src/commands/status.ts:11,87-103` (T2 — direct inspection), `SPEC.md:925` (T3)
- Runtime exit-state behavior is partially aligned but still non-compliant on success paths: both loop scripts emit `stopped` for manual/limit exits, but still write `completed` on successful completion where spec requires `stopped`/`exited` semantics.
  - Source: `aloop/bin/loop.sh:1534,1667` (T2), `aloop/bin/loop.ps1:1672,1774,1815,1824` (T2), `SPEC.md:900-924" (T3)
- GH command surface remains policy-only (request/since operations) and still does not expose high-level workflow entrypoints `aloop gh start|watch|status|stop`.
  - Source: `aloop/cli/src/commands/gh.ts:48-58` (T2 — direct inspection), `SPEC.md:1290-1364,1418-1431" (T3)

## 2026-03-14 14:19Z — Planning recheck: dashboard/GH parity and evidence drift [T2+T3]

- Proof artifacts previously flagged missing are now present in the repo root, so the proof-artifact presence gate is no longer a blocker.
  - Source: command run `glob "**/{dashboard-dead-pid-proof.json,triage-steering-proof.json,loop-exit-state-proof.txt}"` (matches all three files) (T2)
- GH command surface is still policy-level only (`pr-create`, `issue-label`, `issue-comments`, etc.) and still does not implement high-level `aloop gh start|watch|status|stop` workflows required by spec.
  - Source: `aloop/cli/src/commands/gh.ts:49-58` (T2 — direct inspection), `SPEC.md:1294-1366,1422-1433" (T3)
- `gh.ts` branch coverage remains below the file-level gate target for touched code (`78.46%` branches), despite all `gh.test.ts` tests passing.
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (coverage report line `gh.ts ... branch % 78.46`) (T2), review gate target in `TODO.md" current phase (T3)
- `aloop status` still renders only flat active sessions plus provider health and does not show orchestrator→child issue/PR tree data.
  - Source: `aloop/cli/src/commands/status.ts:44-70` (T2 — direct inspection), `SPEC.md:1205,1275" (T3)
- Dashboard parity gaps remain open: header uses wrapping flex layout, provider/model are not shown together, and docs tabs are not filtered for non-empty content.
  - Source: `aloop/cli/dashboard/src/App.tsx:295,359,382-384,572-589` (T2 — direct inspection), `SPEC.md:878-882,919-924" (T3)
- Pipeline config model from spec is still not present in-repo (`.aloop/pipeline.yml` and `.aloop/agents/` not found), so configurable agent pipeline work remains open.
  - Source: command run `glob "**/.aloop/pipeline.yml"` (no matches) and `glob "**/.aloop/agents/**"` (no matches) (T2), `SPEC.md:2211-2225,2318-2323" (T3)
- Branch-evidence parity for PowerShell is now materially present via `loop.tests.ps1` generating `coverage/ps1-proof-branch-coverage.json` targeting `aloop/bin/loop.ps1` at `>=80%` threshold, reducing urgency of a dedicated "add ps1 branch-evidence gate" task.
  - Source: `aloop/bin/loop.tests.ps1:816-855" (T2 — direct inspection)

## 2026-03-14 15:45Z — Planning recheck: exit-state parity resolved; dashboard steering not yet applied to code [T2+T3]

- Loop exit-state parity is NOW COMPLIANT: both `loop.sh` and `loop.ps1` emit `exited` for success paths and `stopped` for limit/interrupt exits. `stuck_count` resets on successful build iterations (not just skip paths). The earlier research entries flagging this as non-compliant are superseded by commits `ca10e4a` and `13a993c`.
  - Source: `aloop/bin/loop.sh:1534,1617,1633,1667` (T2), `aloop/bin/loop.ps1:1672,1759,1774,1815,1824" (T2)
- Steering commits `8719b63` (provider health sidebar) and `ffd05fe` (header grid layout) only modified `SPEC.md` and `TODO.md` — they did NOT touch dashboard source code (`App.tsx`). The dashboard still uses flex-wrap layout (line 295) and provider health is still inline in the header (lines 382-384), not in a sidebar tab.
  - Source: `git show 8719b63 --stat` (only SPEC.md, TODO.md changed) (T2), `git show ffd05fe --stat` (only SPEC.md, TODO.md changed) (T2), `aloop/cli/dashboard/src/App.tsx:295,382-384" (T2 — direct inspection)
- `gh.ts` branch coverage remains at 78.46%. Key untested branches: remove-label path (line 162), issue-create without labels (lines 142-144), `childCreatedPrNumbers` fallback (lines 228-234), `parseGhOutput` error handling (lines 324-325), `evaluatePolicy` default return (lines 368-369).
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (branch % 78.46) (T2)
- Docs panel filters out `TODO.md` by name and returns null when no docs exist, but does NOT filter docs with empty string content. Spec requires filtering non-empty.
  - Source: `aloop/cli/dashboard/src/App.tsx:572-573,585" (T2 — direct inspection)
- Proof artifacts are present and no longer blocking: `dashboard-dead-pid-proof.json`, `triage-steering-proof.json`, `loop-exit-state-proof.txt` all exist.
  - Source: previous research entry 14:19Z confirmed (T2)
- Dead-PID liveness correction in dashboard is implemented via `withLivenessCorrectedState()`.
  - Source: `aloop/cli/src/commands/dashboard.ts:187-198" (T2 — direct inspection)

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
  - Source: `aloop/cli/dashboard/src/App.tsx:341,366,920-927" (T2 — direct inspection)

### GH workflow commands — now implemented

- All four high-level GH workflow commands exist: `start` (line 904), `watch` (line 939), `status` (line 958), `stop` (line 967).
  - Source: `aloop/cli/src/commands/gh.ts:904,939,958,967` (T2 — direct inspection)
- Watch-cycle completion finalization gap: `refreshWatchState()` (lines 373-403) detects running→completed transitions by reading session state, but does NOT create PRs or post issue summary comments for sessions that completed after launch (where `pending_completion` was true at start time).
  - Source: `aloop/cli/src/commands/gh.ts:373-403,925-926` (T2 — direct inspection)
- Missing feedback signals: no `@aloop` mention detection, no manual trigger handling, no review-change semantics, no CI failure log context ingestion. PR feedback loop only checks review comments + check run conclusions.
  - Source: grep for `@aloop|manual.trigger|review.change|CI.failure.detail` in gh.ts returned 0 matches (T2), `aloop/cli/src/commands/gh.ts:552-614,617-675" (T2 — direct inspection)
- No `gh stop-watch` command or equivalent documented — `gh stop` stops individual issues/all tracked, but no command to stop the watch daemon itself (relies on SIGINT/SIGTERM).
  - Source: `aloop/cli/src/commands/gh.ts:755-778,967-975" (T2 — direct inspection)

### Type-check regression — still present

- `npm run type-check` still fails with 5 TS2345 errors in `gh.test.ts` at lines 1937, 1953, 1964, 2032, 2050. Root cause: `buildWatchEntry()` helper (line 1889) returns `status: string` instead of `GhWatchIssueStatus` type.
  - Source: command run `cd aloop/cli && npx tsc --noEmit" (T2)

### Branch coverage — still below gate

- `gh.ts` branch coverage is at 65.80% (gate target: >=80%). Key uncovered branches identified.
  - Source: command run `cd aloop/cli && node --experimental-test-coverage --import tsx --test src/commands/gh.test.ts` (branch % 65.80) (T2)
- Tests for remove-label path (line 727) and parseGhOutput error/fallback (lines 841, 869) DO exist now. But many new branches from `start/watch/status/stop` commands remain untested.
  - Source: `aloop/cli/src/commands/gh.test.ts:727,841,869" (T2 — direct inspection)

### Dead code — still present

- `fetchPrReviewComments` (lines 488-515): `response` variable assigned from `/reviews` API call at line 489 but never referenced. Only `commentsResponse` (line 495) is used.
  - Source: `aloop/cli/src/commands/gh.ts:489-492" (T2 — direct inspection)

### Playwright config — Windows path separators

- `playwright.config.ts` line 18: webServer command uses backslash path separators (`..\\dist\\index.js`, `.\\e2e\\fixtures\\session`, etc.) which fail on Linux with `MODULE_NOT_FOUND`.
  - Source: `aloop/cli/dashboard/playwright.config.ts:17-18" (T2 — direct inspection)

### Pipeline — not yet implemented

- loop-plan.json compiler does not exist. `loop.sh` lines 360-391 still use hardcoded phase cycle logic with modulo calculations.
  - Source: `aloop/bin/loop.sh:360-391` (T2 — direct inspection), glob for `**/loop-plan.json" (no matches) (T2)

### Proof manifest iter 43

- Iteration 43 proof artifacts (`gh-help.txt`, `gh-status-text.txt`, `gh-status-json.json`, `gh-stop-all-success.json`, `gh-status-after-stop.txt`, `dashboard-api-state.json`, `dashboard-server.log`, `gh-stop-json.json`) remain missing. Iteration 45 proof artifacts are present.
  - Source: glob for `**/{gh-help.txt,gh-status-text.txt,dashboard-api-state.json}" (no matches) (T2)

## 2026-03-14 17:45Z — Planning recheck: dead code resolved, dashboard/GH/pipeline gaps remain [T2+T3]

### Dead code — resolved

- The previously flagged dead code in `fetchPrReviewComments` (unused `response` from `/reviews` API) has been removed.
  - Source: `aloop/cli/src/commands/gh.ts:489" (T2 — direct inspection)

### Dashboard — remaining gaps vs spec

- **Provider health NOT in sidebar tab**: Provider info is still inline in the header grid (lines 385-389). Spec §6 requires it in a "dedicated left-pane tab". No sidebar tab structure exists.
  - Source: `aloop/cli/dashboard/src/App.tsx:385-389` (T2 — direct inspection), `SPEC.md:794,798,839" (T3)
- **No per-iteration duration**: Iteration/artifact gallery rows show iteration number + artifact count only, no duration. Spec §6 requires per-iteration duration in log rows and average duration in header.
  - Source: `aloop/cli/dashboard/src/App.tsx:920-930,341,366` (T2 — direct inspection), `SPEC.md:796,805,846-847" (T3)
- **No sidebar expand/collapse button**: No sidebar toggle button exists vertically centered with header title row.
  - Source: `aloop/cli/dashboard/src/App.tsx" (T2 — direct inspection), `SPEC.md:804,845" (T3)
- **No overflow ellipsis menu for docs**: Docs panel does not overflow large doc sets into an `...` menu.
  - Source: `aloop/cli/dashboard/src/App.tsx:568-630` (T2 — direct inspection), `SPEC.md:806,849" (T3)
- **No commit diffstat/change-type badges**: No per-file M/A/D/R markers in commit detail views.
  - Source: `aloop/cli/dashboard/src/App.tsx" (T2 — direct inspection), `SPEC.md:797,848" (T3)

### GH workflow — remaining gaps vs spec

- **No `@aloop` mention detection**: `gh.ts` has no code for detecting `@aloop` mentions.
  - Source: grep for `@aloop|mention|trigger` in `gh.ts" (T2 — no matches), `SPEC.md:1808" (T3)
- **No CI failure log ingestion**: No `gh run view --log-failed` call exists.
  - Source: grep for `log-failed|run view|CI failure` in `gh.ts" (T2 — no matches), `SPEC.md:1821-1837" (T3)
- **No `gh stop-watch` command**: No dedicated `stop-watch` subcommand.
  - Source: `aloop/cli/src/commands/gh.ts:967-975" (T2 — direct inspection), `SPEC.md:1769" (T3)
- **Watch-cycle completion finalization**: `refreshWatchState()` detects transitions but does NOT create PRs or post comments.
  - Source: `aloop/cli/src/commands/gh.ts:373-403" (T2 — direct inspection), `SPEC.md:1767" (T3)

### Pipeline — still not implemented

- `loop-plan.json` compiler does not exist. `loop.sh` lines 360-376 still use hardcoded cycle logic.
  - Source: `aloop/bin/loop.sh:360-376" (T2 — direct inspection), glob for `**/loop-plan.json" (no matches) (T2)
- No `.aloop/pipeline.yml` or `.aloop/agents/` directory exists.
  - Source: glob for `**/pipeline.yml` and `**/.aloop/agents/**" (no matches) (T2)

### Status tree — still flat

- `aloop status` renders flat sessions. No orchestrator→child tree rendering.
  - Source: `aloop/cli/src/commands/status.ts:44-70" (T2 — prior research confirmed)

### Branch coverage — still below gate

- `gh.ts` branch coverage remains at ~65.80%.
  - Source: prior research entry 16:00Z (T2)

## 2026-03-14 18:50Z — Gap analysis: Start/resume logic, GH Actions decomposition, Spec parity [T2+T3]

### CLI Resume Bug — Confirmed
- `aloop start <session-id> --launch resume` is broken. Blindly generates a *new* session ID.
  - Source: `aloop/cli/src/commands/start.ts:627-635" (T2 — direct inspection)

### Orchestrator / GH Actions — Gap
- Decomposition agents do not include "Set up GitHub Actions CI" as an early task.
  - Source: grep for `GitHub Actions` in `orchestrate.ts" and `templates/" (T2 — no hits)

### Spec Parity — Resolved
- Architecture drift regarding `.mjs` and zero npm deps resolved in spec.
  - Source: `SPEC.md" (T1/T3)

### Proof Manifest Iter 43 — Still Missing
- Artifacts required for iteration 43 are still absent.
  - Source: glob for artifacts (T2 — no matches)

## 2026-03-14 17:58Z — Gap analysis: setup parity + dashboard command artifacts [T2+T3]

### `aloop setup` parity gaps — confirmed
- Interactive setup does **not** auto-detect `.github/workflows` or check Actions support.
  - Source: `aloop/cli/src/commands/setup.ts:49-71" (T2 — direct inspection), `SPEC.md:676-679" (T3)
- Setup does not expose `--mode loop|orchestrate` in CLI options.
  - Source: `aloop/cli/src/commands/setup.ts:4-10" (T2 — direct inspection), `SPEC.md:684-687" (T3)

### Dashboard command/prompt files — present
- Dashboard command files exist.
  - Source: glob matches (T2), `SPEC.md:856-857" (T3)

## 2026-03-14 19:15Z — Planning recheck: loop-plan frontmatter landed, @aloop/CI-log landed, review gates still open [T2+T3]

### Loop Script — Cycle Resolution Landed, Queue/Requests Still Missing

- `loop.sh` now reads `loop-plan.json` and resolves cycle prompts via frontmatter.
  - Source: `aloop/bin/loop.sh" (T2 — direct inspection)
- **queue/ folder check is NOT implemented**.
  - Source: grep in `loop.sh" (T2 — no matches)
- **requests/ wait loop is NOT implemented**.
  - Source: grep in `loop.sh" (T2 — no matches)

### GH Workflow — @aloop Mention + CI Log Ingestion Landed

- `@aloop` mention detection and CI failed-log ingestion implemented.
  - Source: `aloop/cli/src/commands/gh.ts:550-573,643" (T2 — direct inspection)

### Review Gates — Status Update

- **Gate 1**: [FIXED] `completion_finalized` now only set if `finalizeWatchEntry()` returns `true`.
  - Source: `aloop/cli/src/commands/gh.ts" (T2 — direct inspection)
- **Gate 2**: Tests for `@aloop` and CI log ingestion are absent.
  - Source: `aloop/cli/src/commands/gh.test.ts" (T2 — direct inspection)
- **Gate 3**: Branch coverage at 63.32%, well below target.
  - Source: c8 report (T2)
- **Gate 6**: Proof manifest artifacts missing.
  - Source: grep in workspace (T2)

### CLI Resume — Fixed

- `aloop start <session-id> --launch resume` fixed.
  - Source: commit `607edaa" (T2)

## 2026-03-14 20:20 — Gap analysis: Loop Script Completion + Orchestrator Implementation [T1+T2+T3]

- `loop.sh` and `loop.ps1` **now implement** `queue/` folder check and `requests/` wait loop.
  - Source: `aloop/bin/loop.sh:1684-1731`, `aloop/bin/loop.ps1:1779-1857" (T2 — direct inspection)
- `gh.ts` branch coverage is now **81.59%**, meeting Gate 3 (>80%).
  - Source: coverage report (T2)
- `aloop/bin/loop_branch_coverage.tests.sh` **is missing** registrations for new loop script features.
  - Source: `aloop/bin/loop_branch_coverage.tests.sh:58-80" (T2 — direct inspection)
- Proof artifacts for iteration 11 are missing.
  - Source: `ls" (T2 — confirmed missing)

## 2026-03-15 10:10 — Gap analysis: Loop scripts, requests, and dashboard UX [T2+T3]

- `loop.sh` and `loop.ps1` exit states:
  - Success paths write `state: "exited"`.
  - Interrupt/limit paths write `state: "stopped"`.
  - Verified: `loop.sh` uses `exited` and `stopped` as required. (T2 — re-inspection)
- `STUCK_COUNT` reset logic:
  - `loop.sh` resets `STUCK_COUNT` to 0 on successful iteration.
  - Verified: `loop.sh:1904` (T2 — re-inspection).
- `UpdateIssueRequest` interface bug: Fixed.
- Dashboard UX gaps (SPEC §6): Still missing sidebar health tab, per-iteration duration, centered toggle, M/A/D/R badges.
- Test coverage gaps (Gate 3): `requests.ts` (57.38%), `plan.ts` (73.91%).
- Missing proof artifacts for iteration 11.

## 2026-03-15 15:00 — Gap analysis: coverage targets and dashboard UI maturity [T2+T3]

### Coverage — Still below target [T2]
- `plan.ts` branch coverage is **73.91%** (goal: >=80%). Missing coverage for `forceReviewNext`, `forceProofNext`, and `forcePlanNext` mutation branches.
  - Source: `cd aloop/cli && node --import tsx --test --experimental-test-coverage src/lib/plan.test.ts` (T2)
- `requests.ts` branch coverage is **84.09%**. Target met.
  - Source: `cd aloop/cli && node --import tsx --test --experimental-test-coverage src/lib/requests.test.ts` (T2)
- `yaml.ts` branch coverage is **73.33%** (goal: >=90%).
  - Source: `TODO.md` (T3)

### Dashboard UX — Status Update [T2]
- **Sidebar Tab for Health**: NOT implemented. Health is still a tab in the Docs panel. Spec requires a dedicated sidebar tab.
  - Source: `aloop/cli/dashboard/src/App.tsx:697` (T2)
- **Centered Sidebar Toggle**: NOT implemented. Toggle is in Sidebar header and Header bar, but not centered with title row.
  - Source: `aloop/cli/dashboard/src/App.tsx:603,803` (T2)
- **Empty Doc Filtering**: Partially implemented. `DocContent` handles null/empty, but `TabsTrigger` list still includes empty docs.
  - Source: `aloop/cli/dashboard/src/App.tsx:683-690` (T2)
- **M/A/D/R Change Badges**: NOT implemented. Commit detail view is missing.
  - Source: `aloop/cli/dashboard/src/App.tsx` (T2)
- **Per-Iteration Duration**: NOT implemented in log rows.
  - Source: `aloop/cli/dashboard/src/App.tsx:920-930` (T2)
- **Session Timing Header**: DONE. Elapsed and Avg Duration visible in header HoverCard and as dedicated elements.
  - Source: `aloop/cli/dashboard/src/App.tsx:628-662` (T2)

## 2026-03-15 11:14Z — Planning recheck: TODO drift vs spec-compliant dashboard and remaining gate blockers [T2+T3]

- `VERSIONS.md` is still missing from the workspace root, so Gate 8 remains open.
  - Source: `glob **/VERSIONS.md` under `/home/pj/.aloop/sessions/ralph-skill-20260314-173930/worktree` returned no matches (T2 — direct command result); `REVIEW_LOG.md:12` and `review-verdict.json:4` (T3).
- Provenance trailers are still not implemented in runtime loop scripts; commit paths shown use plain `git commit -m` without `Aloop-Agent/Aloop-Iteration/Aloop-Session` trailers.
  - Source: `aloop/bin/loop.sh:1448`, `aloop/bin/loop.ps1:1369` (T2 — direct inspection); trailer requirement in `SPEC.md:3091-3097` (T3).
- Current TODO item requesting a dedicated sidebar health tab is out of sync with spec: spec requires provider health as a docs-panel tab, and the dashboard currently implements `_health` in `DocsPanel`.
  - Source: `SPEC.md:913` (T3); `aloop/cli/dashboard/src/App.tsx:714-751` (T2 — direct inspection).
- Current TODO items for missing `M/A/D/R` badges and per-iteration duration are stale: both are already present in `App.tsx`.
  - Source: `aloop/cli/dashboard/src/App.tsx:1034-1037` (type marker rendered per file), `aloop/cli/dashboard/src/App.tsx:1002-1005` (duration rendering) (T2 — direct inspection); requirement context `SPEC.md:906` (T3).
- Docs-tab filtering is still partially non-compliant: tabs include docs when value is defined, not when content is non-empty; spec explicitly requires non-empty doc tabs only.
  - Source: `aloop/cli/dashboard/src/App.tsx:706` (filter by `!== undefined`) and `aloop/cli/dashboard/src/App.tsx:759-763` (empty-content fallback) (T2 — direct inspection); `SPEC.md:912` (T3).
## 2026-03-15 — GitHub-native state model: full API contract research [P0]

### Motivation
The orchestrator needs a state model for tracking issues, their lifecycle status, dependencies, and progress. GitHub Issues alone only offer `open`/`closed` — insufficient for orchestrator workflows. **GitHub Projects V2** provides fully custom status columns (single-select fields) that map directly to orchestrator phases.

### Prerequisites
- **OAuth scope**: `read:project` (read) and `project` (write) are required for Projects V2 API
- **Setup action**: user must run `gh auth refresh -s project` to add the scope
- **Orchestrator setup skill should detect and prompt for this automatically**
- Source: live testing against `gh api graphql` — `INSUFFICIENT_SCOPES` error without `project` scope (T2)

---

### 1. Issue States (native)

Only two states on issues themselves:
- `state`: `"open"` | `"closed"`
- `state_reason`: `"completed"` | `"not_planned"` | `"duplicate"` | `"reopened"` | `null`

Set via: `PATCH /repos/{o}/{r}/issues/{n}` with `{"state": "closed", "state_reason": "completed"}`
GraphQL: `closeIssue(input: {issueId, stateReason: COMPLETED | NOT_PLANNED | DUPLICATE})`

Source: GitHub REST API docs, verified via `gh api` (T2)

### 2. Projects V2 — Custom Status (the real state machine)

Projects V2 provides a **Status** field (type `SINGLE_SELECT`) with fully custom options. This is the key primitive for orchestrator state management.

**Default options** (on project creation):
| Option | Color | ID (regenerated on update) |
|--------|-------|---------------------------|
| Todo | GREEN | (dynamic) |
| In Progress | YELLOW | (dynamic) |
| Done | PURPLE | (dynamic) |

**Custom options** — fully supported. Verified by adding "Blocked" (RED) to project #1:
```graphql
mutation {
  updateProjectV2Field(input: {
    fieldId: "<status-field-id>"
    singleSelectOptions: [
      {name: "Todo", color: GREEN, description: "Not started"}
      {name: "In Progress", color: YELLOW, description: "Actively being worked on"}
      {name: "Blocked", color: RED, description: "Blocked by dependency"}
      {name: "In Review", color: BLUE, description: "PR under review"}
      {name: "Done", color: PURPLE, description: "Completed"}
    ]
  }) {
    projectV2Field { ... on ProjectV2SingleSelectField { options { id name color } } }
  }
}
```

**Important**: Options are matched by **name**, not id. Option IDs are regenerated on every `updateProjectV2Field` call. Always re-read option IDs after updating the field.

Available colors: `GRAY`, `BLUE`, `GREEN`, `YELLOW`, `ORANGE`, `RED`, `PINK`, `PURPLE`

Source: live mutation against `johnnyelwailer/projects/1`, GraphQL schema introspection (T2)

### 3. Moving Items Between Statuses

```graphql
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "<project-node-id>"
    itemId: "<item-node-id>"
    fieldId: "<status-field-id>"
    value: { singleSelectOptionId: "<option-id>" }
  }) { projectV2Item { id } }
}
```

The `value` input accepts: `text`, `number`, `date`, `singleSelectOptionId`, `iterationId`

Source: GraphQL schema introspection of `ProjectV2FieldValue` input type, live mutation verified (T2)

### 4. Adding Issues to a Project

```graphql
mutation {
  addProjectV2ItemById(input: {
    projectId: "<project-node-id>"
    contentId: "<issue-or-pr-node-id>"
  }) { item { id } }
}
```

CLI equivalent: `gh project item-add <project-number> --owner <owner> --url <issue-url>`

Source: GitHub GraphQL docs, `gh project` CLI (T2)

### 5. Reading Project Items + Status

CLI: `gh project item-list <number> --owner <owner> --format json`
Returns: `{items: [{id, title, status, content: {id, title, type, body}}]}`

GraphQL bulk query:
```graphql
query($projectId: ID!, $cursor: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { ... on Issue { id number title state } ... on PullRequest { id number title state } }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
              ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
            }
          }
        }
      }
    }
  }
}
```

Source: live query verified against project #1 (T2)

### 6. All Available Field Types

From GraphQL `ProjectV2FieldType` enum:
`TITLE`, `TEXT`, `SINGLE_SELECT`, `NUMBER`, `DATE`, `ITERATION`, `ASSIGNEES`, `LABELS`, `MILESTONE`, `REPOSITORY`, `REVIEWERS`, `LINKED_PULL_REQUESTS`, `TRACKS`, `TRACKED_BY`, `ISSUE_TYPE`, `PARENT_ISSUE`, `SUB_ISSUES_PROGRESS`

Source: GraphQL schema introspection (T2)

### 7. Sub-issues (GA, all plans)

- **50 sub-issues/parent**, **8 nesting levels**
- REST: `GET/POST /repos/{o}/{r}/issues/{n}/sub_issues`, `GET .../parent`
- GraphQL: `addSubIssue`, `removeSubIssue`, `reprioritizeSubIssue` mutations
- Query: `issue { subIssues(first:50) { nodes { id number title state } } subIssuesSummary { total completed percentCompleted } parent { id number } }`
- Every issue object includes `sub_issues_summary: {total, completed, percent_completed}`

Source: GitHub REST/GraphQL docs, schema introspection (T2)

### 8. Issue Dependencies (GA)

- **50 per relationship type** per issue
- GraphQL: `addBlockedBy(input: {issueId, blockingIssueId})` / `removeBlockedBy`
- Query: `issue { blockedBy(first:50) { nodes { id number } } blocking(first:50) { nodes { id number } } issueDependenciesSummary { blockedBy totalBlockedBy blocking totalBlocking } }`
- REST: `/repos/{o}/{r}/issues/{n}/issue-dependencies`
- Search filters: `is:blocked`, `is:blocking`, `blocked-by:<n>`, `blocking:<n>`

Source: GitHub changelog 2025-08-21 (dependencies GA), schema introspection (T2)

### 9. Labels

- Max **100 labels/issue**, name max **50 chars**, description max **100 chars**
- Full CRUD: `POST /repos/{o}/{r}/labels`, `POST /repos/{o}/{r}/issues/{n}/labels`

Source: GitHub REST API docs, community discussions (T2)

### 10. Efficient Polling

**ETag/conditional requests:**
- Issues list returns `Etag` header; `304 Not Modified` is **free** (no rate limit cost)
- `since` param: `GET /repos/{o}/{r}/issues?since=<ISO8601>` — only issues updated after timestamp
- `If-Modified-Since` header also supported

**GraphQL bulk queries:**
- ~172 points for 100 issues with all connections (budget: 5,000 pts/hr standard, 10,000 enterprise)
- Max nodes per query: 500,000

Source: GitHub best practices docs, live ETag header inspection (T2)

### 11. Webhooks

- `issues` event: `opened, closed, reopened, labeled, unlabeled, assigned, milestoned, edited, deleted`
- `sub_issues` event: add/remove sub-issue, add/remove parent
- Issue dependencies: supported in webhooks (GA)
- `pull_request` event: `opened, closed, labeled, synchronize, ready_for_review`
- `projects_v2_item` event: fires when project items are created, edited, deleted, archived, restored, reordered, or converted

Source: GitHub webhook docs, changelog (T2)

### 12. Metadata Storage

- Issue body: **65,536 codepoint** limit — embed YAML/JSON in HTML comments or frontmatter
- Assignees: max **10/issue**
- Milestones: **1 per issue** (useful for wave grouping)
- Custom issue fields (org-level, preview): up to 25 per org

Source: GitHub docs (T2)

---

### Recommended Orchestrator State Model

**Use Projects V2 as the primary state machine**, not just `open`/`closed`:

| Status | Color | Meaning |
|--------|-------|---------|
| Backlog | GRAY | Decomposed but not yet scheduled |
| Todo | GREEN | Scheduled in current wave |
| In Progress | YELLOW | Child loop actively working |
| Blocked | RED | Waiting on dependency |
| In Review | BLUE | PR created, under review |
| Done | PURPLE | PR merged |

**Minimal local state** (`sessions.json`): `{issue_number → {session_id, pid}}` — just for PID tracking. Everything else lives in GitHub.

**Setup requirement**: The setup skill must ensure `gh auth` has `project` scope:
```bash
# Check if scope exists
gh auth status 2>&1 | grep -q 'project' || gh auth refresh -s project
```
