# Project TODO

## Current Phase: P2 Orchestrator Triage + Dashboard Regression Fixes

### In Progress
- [x] [review][high] Complete triage comment actions in `applyTriageResultsToIssue`: post clarification/question replies, include required triage footer, and skip bot/external-author comments per spec.
- [ ] [review] Gate 1: `runTriageMonitorCycle` is only invoked during `orchestrateCommandWithDeps` initialization (`orchestrate.ts:414-416`) and actionable comments marked `steering_injected` are not actually written to `STEERING.md`/child TODO; implement true monitor-loop integration and real steering injection per SPEC triage intent (priority: high).
- [ ] [review] Gate 5: repository validation is still red (`aloop/cli npm test` fails at `src/commands/session.test.ts` — `resolveHomeDir trims trailing separators...`), so regression gate cannot pass; fix or stabilize this test to restore green baseline (priority: high).
- [ ] [review] Gate 6: proof manifest artifacts are not present (`proof-run.log`, `monitor-cycle-proof.json`, `triage-action-policy-proof.json` not found in workspace); regenerate and attach verifiable artifacts at declared paths (priority: high).

### Up Next
- [x] [orchestrator][high] Wire a real monitor-cycle triage step into orchestrator flow: poll `aloop gh issue-comments`/`pr-comments`, apply triage per issue, and persist `last_comment_check` + `triage_log` updates.
- [x] [tests][high] Harden triage tests in `orchestrate.test.ts` with exact GH-arg assertions and add coverage for `question`, `out_of_scope`, and `execGh` failure paths.
- [ ] [tests][high] Raise `gh.ts` branch coverage to >=80% by adding missing branch tests (`issue-label` remove path, parse fallbacks/error branches, default-throw branches).
- [ ] [runtime+dashboard][high] Align loop exit/status behavior with spec: emit `stopped`/`exited` where required, reset `stuck_count` on successful iteration, and make dashboard detect dead PID instead of stale running state.
- [ ] [dashboard][high] Add activity/timing context: provider+model together, per-iteration duration, elapsed since `session_start`, total iterations, and average iteration duration.
- [ ] [tests][medium] Fix pre-existing `session.test.ts` failure for `resolveHomeDir` trailing-separator handling on this Linux/Git-Bash path case.
- [ ] [dashboard][medium] Refine docs panel behavior: render only non-empty docs and add overflow handling (`...`) for large doc sets.
- [ ] [build][low] Ensure dashboard build prerequisites are present (`vite` in `aloop/cli/dashboard`) so `npm run build` is runnable in a fresh environment.
- [ ] [gh-workflows][medium] Implement high-level GH workflow commands: `aloop gh start --issue`, `aloop gh watch`, `aloop gh status`, and `aloop gh stop` with persisted watch/status state.
- [ ] [gh-workflows][medium] Implement PR feedback re-iteration loop (review comments + CI failures) with configurable max feedback iterations.
- [ ] [pipeline][medium] Implement configurable agent pipeline (`pipeline.yml` / config inline) with named agents, transitions (`retry|goto`), and backward-compatible defaults.
- [ ] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder (verification failure handling).
- [ ] [status][medium] Extend `aloop status` to show orchestrator tree (orchestrator session -> child sessions -> issue/PR mapping).
- [ ] [spec-parity][low] Reconcile spec constraints (`zero npm deps`, `.mjs` only/no build, `lib/config.mjs`) vs current TS/bundled CLI architecture, or update spec explicitly.
- [ ] [acceptance][low] Add automated legacy-name guard and run final SPEC acceptance sweep.

### Completed
- [x] [orchestrator/P2] Child-loop dispatch engine with concurrency cap, worktree/branch mapping, and lifecycle tracking.
- [x] [orchestrator/P2] PR lifecycle gates (CI/mergeability/review) with squash-merge to `agent/trunk` and conflict handling.
- [x] [triage/P2] Added GH triage prerequisites in `aloop gh` (`issue-label`, `issue-comments --since`, `pr-comments --since`).
- [x] [triage/P2] Added triage state fields and classification helpers (`last_comment_check`, `blocked_on_human`, `processed_comment_ids`, `triage_log`).
- [x] [dashboard/P2] Multi-session dashboard APIs and frontend session switching.
- [x] [dashboard/P2] Proof artifact rendering (image/code viewers and comparisons).
- [x] [proof/P2] `PROMPT_proof.md` already enforces human-verifiable artifacts and bans CI/typecheck/diff-only proof.
