# Project TODO

## Current Phase: P2 Triage + Runtime/Dashboard Spec Parity

### In Progress
- [x] [review][high] Restore green baseline by fixing `resolveHomeDir` trailing-separator behavior (`session.test.ts` currently failing on Linux/Git-Bash path case).

### Up Next
- [x] [review][high] Regenerate and attach missing proof artifacts (`proof-run.log`, `monitor-cycle-proof.json`, `triage-action-policy-proof.json`) so review gate evidence is verifiable.
- [ ] [runtime+dashboard][high] Align loop/runtime state handling with spec: emit `stopped`/`exited` where required, reset `stuck_count` on successful iterations, and auto-correct dashboard running state when session PID is dead.
- [ ] [tests][high] Raise `gh.ts` branch coverage to >=80% with targeted tests for remaining uncovered branches (notably issue-label remove path and parse/error fallback branches).
- [ ] [dashboard][medium] Add activity/timing context: provider+model together, per-iteration duration, elapsed since `session_start`, total iterations, and average iteration duration.
- [ ] [dashboard][medium] Refine docs panel behavior: render only non-empty docs and add overflow handling (`...`) for large doc sets.
- [ ] [gh-workflows][medium] Implement high-level GH workflow commands: `aloop gh start --issue`, `aloop gh watch`, `aloop gh status`, and `aloop gh stop` with persisted watch/status state.
- [ ] [gh-workflows][medium] Implement PR feedback re-iteration loop (review comments + CI failures) with configurable max feedback iterations.
- [ ] [pipeline][medium] Implement configurable agent pipeline (`pipeline.yml` / config inline) with named agents and transitions (`retry|goto`) while preserving backward-compatible defaults.
- [ ] [pipeline][medium] Add runtime pipeline mutation + guard-agent escalation ladder for verification failures.
- [ ] [status][medium] Extend `aloop status` to show orchestrator tree (orchestrator session -> child sessions -> issue/PR mapping).
- [ ] [spec-parity][low] Reconcile spec constraints (`zero npm deps`, `.mjs` only/no build, `lib/config.mjs`) vs current TS/bundled CLI architecture, or update spec explicitly.
- [ ] [acceptance][low] Add automated legacy-name guard and run final SPEC acceptance sweep.

### Completed
- [x] [review][high] Complete end-to-end triage behavior: `steering_injected` now writes `STEERING.md` to child loop worktree so actionable feedback is a real mutation picked up by loop.sh steering detection.
- [x] [review][high] Complete triage comment actions in `applyTriageResultsToIssue`: clarification/question replies include triage footer and bot/external-author filtering behavior.
- [x] [orchestrator][high] Wire triage monitor-cycle helper into orchestrator initialization path when repo + GH executor are provided.
- [x] [tests][high] Expand triage coverage in `orchestrate.test.ts` for `question`, `out_of_scope`, mixed batches, and `execGh` failure propagation paths.
- [x] [orchestrator/P2] Child-loop dispatch engine with concurrency cap, worktree/branch mapping, and lifecycle tracking.
- [x] [orchestrator/P2] PR lifecycle gates (CI/mergeability/review) with squash-merge to `agent/trunk` and conflict handling.
- [x] [triage/P2] Added GH triage prerequisites in `aloop gh` (`issue-label`, `issue-comments --since`, `pr-comments --since`).
- [x] [triage/P2] Added triage state fields and classification helpers (`last_comment_check`, `blocked_on_human`, `processed_comment_ids`, `triage_log`).
- [x] [dashboard/P2] Multi-session dashboard APIs and frontend session switching.
- [x] [dashboard/P2] Proof artifact rendering (image/code viewers and comparisons).
- [x] [proof/P2] `PROMPT_proof.md` enforces human-verifiable artifacts and bans CI/typecheck/diff-only proof.
- [x] [build][low] Verified dashboard build prerequisite exists (`vite` already declared in `aloop/cli/dashboard/package.json`).
