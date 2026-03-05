# Project TODO

## Current Phase: CLI Surface Unification + Security Boundary + Proof Pipeline

### In Progress
- [x] Implement PATH hardening in `aloop/bin/loop.ps1`: prepend gh-blocking shim directory for provider execution windows and restore PATH afterward; 7 Pester regression tests. (priority: P1)
- [x] Fix `aloop/bin/loop.sh` RETURN-trap leakage in `invoke_provider` (trap persists beyond function return and can clobber PATH for later commands); add regression coverage. (priority: P1)

### Up Next
- [x] Add `aloop gh` command surface with hardcoded role policy scaffolding and audit log events (`gh_operation`, `gh_operation_denied`). (priority: P1)
- [ ] Implement convention-file intake in `aloop/bin/loop.ps1` (`.aloop/requests/*.json` -> `aloop gh` -> `.aloop/responses/*.json` + processed archive). (priority: P1)
- [ ] Implement convention-file intake in `aloop/bin/loop.sh` with PowerShell parity (ordering, responses, archival behavior). (priority: P1)
- [ ] Add missing dashboard command assets: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`. (priority: P1)
- [ ] Add `PROMPT_proof.md` template and ensure scaffold/install paths include it where required. (priority: P1)
- [ ] Update `aloop/bin/loop.ps1` cycle from 5-step to 6-step (`plan -> build x3 -> proof -> review`) with forced-flag compatibility. (priority: P1)
- [ ] Update `aloop/bin/loop.sh` cycle from 5-step to 6-step with matching semantics. (priority: P1)
- [ ] Implement proof artifact persistence in both loop runtimes (`~/.aloop/sessions/<id>/artifacts/iter-<N>/` + `proof-manifest.json`). (priority: P1)
- [ ] Add dashboard backend artifact endpoint (`/api/artifacts/<iteration>/<filename>`) with strict path safety checks. (priority: P2)
- [ ] Add dashboard proof artifact rendering (image thumbnail/expand + text/code viewer). (priority: P2)
- [ ] Implement `aloop start` CLI command (session creation, prompt copy, worktree/in-place, loop launch, active session registration). (priority: P2)
- [ ] Implement `aloop setup` CLI command as first-class interactive discover/scaffold flow. (priority: P2)
- [ ] Add `aloop discover --scope project|full` parity with Phase 2 schema expectations (project scope baseline + full provider/model enrichment). (priority: P2)
- [ ] Refactor `/aloop:start` and `/aloop:setup` command/prompt files to thin wrappers that delegate to CLI-first `aloop start`/`aloop setup`. (priority: P2)
- [ ] Add `aloop status --watch` live refresh mode (argument parsing, refresh loop, graceful exit). (priority: P2)
- [ ] Implement `aloop start` auto-monitoring UX (`status --watch` terminal + dashboard/browser launch options from config). (priority: P2)
- [ ] Add multi-session dashboard switching (`/api/state?session=<id>`, SSE rebinding, client session picker). (priority: P2)
- [ ] Replace tabbed dashboard core with dense single-page layout using required components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`) and keep mobile usability. (priority: P2)
- [ ] Add `aloop orchestrate --plan-only` command to persist `orchestrator.json` decomposition and wave metadata. (priority: P2)
- [ ] Implement orchestrator dispatch core (issue creation, wave gating, concurrency cap, child loop launch/worktree mapping). (priority: P2)
- [ ] Implement orchestrator PR lifecycle (checks, agent review, merge/reopen, conflict retry budget). (priority: P2)
- [ ] Implement user-feedback triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume and processed-comment tracking. (priority: P2)
- [ ] Remove or relocate root-level `reproduce_json_escape_issue.sh` into a test harness so repo root contains no leftover debug scripts. (priority: P3)
- [ ] Run final acceptance sweep against `SPEC.md` checkboxes and refresh TODO completion states based on actual code/tests. (priority: P3)

### Completed
- [x] [review] Gate 5: Fix regression baseline. `Invoke-Pester ./aloop/bin/loop.tests.ps1` fails at discovery with parse errors (e.g., `?.Source` syntax and string escaping syntax errors around line 1029), and `install.tests.ps1` has failing tests due to mismatched expectations. Restore full test suite green before continuing feature work. (priority: P0)
- [x] [review] Gate 1: `aloop/bin/loop.sh` PATH hardening removes whole directories that contain `gh` (`strip_gh_from_path`), which can also remove provider binaries when co-located. Rework sanitization to block `gh` without dropping provider executables. (priority: P1)
- [x] [review] Gate 2: `aloop/bin/loop_path_hardening.tests.sh` misses critical cases; add behavioral tests for (a) provider binary co-located with `gh` still executes, and (b) PATH restoration when provider exits non-zero. (priority: P1)
- [x] [review] Gate 3: Add coverage-capable harness/reporting for shell branch paths and ensure touched runtime logic meets >=80% branch coverage. (priority: P2) [reviewed: gates 1-5 pass]
- [x] Add PowerShell parity for degraded provider handling in `Resolve-HealthyProvider` (`provider_skipped_degraded`, `all_providers_degraded`) and add matching Pester coverage.
- [x] Implement PATH hardening in `aloop/bin/loop.sh`: remove `gh` from PATH for provider execution windows and restore afterward; add regression tests.
- [x] Unify the CLI entry surface so `aloop` routes through one implementation (`aloop.mjs` vs `dist/index.js`) before adding new subcommands; this removes command drift and keeps future behavior testable.
- [x] Core project rename to `aloop` is reflected across runtime paths, command/prompt namespaces, and install target (`~/.aloop/`).
- [x] `install.ps1` installs runtime loop scripts/templates and creates platform CLI shims (`aloop.cmd` and POSIX `aloop` wrapper).
- [x] Native CLI entry exists with working `resolve`, `discover`, `scaffold`, `status`, `active`, and `stop` command behavior.
- [x] Legacy `setup-discovery.ps1` was removed; setup flow is discover/scaffold-driven.
- [x] Final-review gate invariant is implemented in both loops (`tasks_marked_complete`, forced review, `final_review_approved`/`final_review_rejected`).
- [x] Retry-same-phase semantics are implemented in both loops (success-gated phase advancement, forced-flag precedence, retry exhaustion logging).
- [x] Phase prerequisite checks (`phase_prerequisite_miss`) and provider stderr capture are implemented in both runtimes.
- [x] Provider health core exists in both loops (per-provider state files, cooldown/degraded transitions, lock retry + graceful lock-failure path).
- [x] CLAUDECODE sanitization exists at loop entry and provider invocation boundaries (plus CLI entry path).
- [x] Existing setup/start/status/steer/stop command and prompt files are present for Claude and Copilot.
- [x] `json_escape` in `loop.sh` handles `\n`, `\r`, `\t`, `\\`, `\"` and mixed multiline input, with regression coverage.
- [x] `loop.sh` explicitly handles degraded providers (`provider_skipped_degraded`, `all_providers_degraded`) with behavioral tests.
- [x] Spec decision gate resolved: `SPEC.md` explicitly permits the current TypeScript/React pipeline while keeping `aloop.mjs` as stable entrypoint.
