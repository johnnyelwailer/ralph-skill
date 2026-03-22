# TODO

## Current Phase: Orchestrator Core + Test Fixes

### In Progress

- [x] [review] Gate 5: 13 test suites in orchestrate.test.ts fail (21 sub-tests) — e.g. `queues sub-decomposition for epics`, `validateDoR`, `launchChildLoop`, `checkPrGates`, `reviewPrDiff`, `processPrLifecycle`, `runOrchestratorScanPass`, `monitorChildSessions`. Test expectations are stale vs current code (e.g. expects `orch_estimate` agent pattern). Fix the tests to match actual code behavior. (priority: high)

### Up Next

- [x] [review] Gate 9: README.md line 32 documents `--launch-mode resume --session-dir` but actual CLI uses `--launch resume <session-id>`. Fix resume example on line 32 to: `aloop start --launch resume <session-id>`. Dashboard `--session-dir` on line 63 is correct — no change needed there. (priority: high)
- [x] `aloop start` must dispatch to orchestrate when project config has `mode: orchestrate`. Currently rejects with "Invalid mode: orchestrate". See SPEC-ADDENDUM §`aloop start` as Unified Entry Point. (priority: high)
- [x] Orchestrator must spawn as background daemon and register in `active.json` — currently runs synchronously and exits. See SPEC-ADDENDUM §Orchestrator Must Be Fully Autonomous. (priority: high)
- [ ] `aloop orchestrate --resume <session-id>` — resume from existing session. Reads `orchestrator.json`, skips re-decomposition, detects alive/dead children. See SPEC-ADDENDUM §Orchestrator Session Resumability. (priority: high)
- [ ] `process-requests` must handle all standard request types from `lib/requests.ts` (create_issues, update_issue, close_issue, dispatch_child, merge_pr, post_comment, steer_child). Currently only handles decomposition/estimate result files. See SPEC-ADDENDUM §Scan Agent Self-Healing. (priority: high)
- [ ] Branch sync: loop.sh/loop.ps1 must run `git fetch origin <base_branch>` + `git merge` before each iteration. Missing entirely. See SPEC §Branch Sync & Auto-Merge. (priority: high)
- [ ] Phase prerequisites: build requires TODO.md with unchecked tasks (else force plan), review requires commits since last plan (else force build). Missing from loop scripts. See SPEC §Phase Advancement Only on Success. (priority: high)
- [ ] `--no-task-exit` flag for loop.sh/loop.ps1 — orchestrator loop must never auto-complete on TODO.md state. See SPEC-ADDENDUM §Loop Flag: `--no-task-exit`. (priority: high)
- [x] Orchestrator PR review: track `last_reviewed_sha` to avoid duplicate reviews; include previous PR comments in review prompt with "do not repeat" instruction. See SPEC-ADDENDUM §Orchestrator PR Review. (priority: high)
- [x] Child loops must write sub-spec to `TASK_SPEC.md` (not `SPEC.md`), and `TASK_SPEC.md` must be gitignored/excluded from PRs. See SPEC-ADDENDUM §Sub-Spec Handling. (priority: high)
- [ ] Provider health file locking: exclusive `flock` (bash) / `FileShare.None` (PowerShell) with 5-attempt progressive backoff. See SPEC §Global Provider Health > Concurrency / File Locking. (priority: medium)
- [ ] QA coverage tracking: QA agent must create/update `QA_COVERAGE.md` (parseable markdown table) with priority selection algorithm (UNTESTED > FAIL > incomplete > stale). See SPEC-ADDENDUM §QA Agent: Coverage-Aware Testing. (priority: medium)
- [ ] Spec-gap periodic scheduling: run before every 2nd plan phase during normal loop execution. Currently only in finalizer. See SPEC §Spec-Gap Analysis Agent. (priority: medium)
- [ ] Default `aloop --help` should show only 6 user-facing commands; `--help --all` shows everything. See SPEC-ADDENDUM §CLI Simplification. (priority: medium)
- [ ] `compile-loop-plan` must omit `max_iterations` from `loop-plan.json` when mode is `orchestrate`. Loop scripts must treat missing `max_iterations` as no limit. See SPEC-ADDENDUM §Orchestrate Mode: No Iteration Cap. (priority: medium)
- [ ] Review Gate 10: QA coverage percentage and bug fix rate check. Add to PROMPT_review.md. See SPEC-ADDENDUM §QA Coverage-Aware Testing §D. (priority: medium)
- [ ] Merge conflict resolution: queue `PROMPT_merge.md` when conflict detected during branch sync. See SPEC §Branch Sync & Auto-Merge > Merge Agent. (priority: medium)
- [ ] Stuck detection with escalation: track blocker persistence across iterations, write `diagnostics.json` after N same-blocker iterations. See SPEC-ADDENDUM §Scan Agent Self-Healing. (priority: medium)
- [ ] `aloop status --watch` terminal-based live monitoring with auto-refresh. See SPEC §UX: Dashboard. (priority: low)
- [ ] Dashboard command palette (Ctrl+K) — cmdk component is listed as dep but not integrated. See SPEC §UX: Dashboard. (priority: low)
- [ ] Dashboard before/after comparison widget for proof artifacts (side-by-side, slider modes). See SPEC §Proof-of-Work Phase. (priority: low)
- [ ] Dashboard component decomposition: AppView.tsx (2085 lines) → ~15 focused components, each <200 LOC with tests and stories. See SPEC-ADDENDUM §Dashboard Component Architecture. (priority: low)
- [ ] Storybook 8 integration with `@storybook/react-vite`. See SPEC-ADDENDUM §Storybook Integration. (priority: low)
- [ ] Dashboard responsiveness: mobile/tablet breakpoints, hamburger sidebar, touch targets. See SPEC-ADDENDUM §Dashboard Responsiveness. (priority: low)
- [ ] OpenRouter cost monitoring: `opencode db` queries for dashboard widgets, budget warning toasts, cost-by-model breakdown. See SPEC-ADDENDUM §OpenRouter Cost Monitoring. (priority: low)
- [ ] Loop health supervisor agent (`PROMPT_loop_health.md`): monitors `log.jsonl` for stuck patterns, circuit breaker. See SPEC §Configurable Agent Pipeline. (priority: low)
- [ ] `{{SUBAGENT_HINTS}}` template variable expansion in loop scripts. See SPEC §Configurable Agent Pipeline > Subagent Integration. (priority: low)
- [ ] `/aloop:dashboard` command file in `claude/commands/aloop/` and `aloop-dashboard.prompt.md` in `copilot/prompts/`. See SPEC §UX: Dashboard. (priority: low)
- [ ] UI variant exploration: decompose agent creates 2-3 sibling variant sub-issues for UI features when `ui_variant_exploration: true`. See SPEC §UI Variant Exploration. (priority: low)
- [ ] `LocalAdapter` for file-based orchestration without a remote (stores issues as JSON in `.aloop/issues/`). See SPEC-ADDENDUM §Orchestrator Adapter Pattern. (priority: low)
- [ ] Synthetic orchestrator E2E test scenario against agent-forge repo. See SPEC-ADDENDUM §Synthetic Orchestrator Test Scenario. (priority: low)
- [ ] OpenCode first-class parity: `.opencode/agents/` directory, agent YAML parity, cost-aware routing. See SPEC-ADDENDUM §OpenCode First-Class Parity. (priority: low)

### Deferred
- [~] [qa/P2] README resume example uses wrong flags — merged into the [review] Gate 9 task above which covers the same fix.
