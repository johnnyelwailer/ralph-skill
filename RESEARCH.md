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
