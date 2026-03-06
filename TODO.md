# Project TODO

## Current Phase: CLI Surface Unification + Security Boundary + Proof Pipeline

### In Progress
- [x] [review] Gate 5: Restore regression baseline — `gh.test.ts` uses `vitest` (`import { describe, it, expect, ... } from 'vitest'`) while all other tests use `node:test`/`node:assert`. Rewrite `gh.test.ts` to use the existing Node test stack so `npm --prefix aloop/cli test` and `npm --prefix aloop/cli run type-check` pass. (priority: P0)
- [x] [review] Gate 1: `evaluatePolicy` in `gh.ts` uses `payload.repo || 'owner/repo'` placeholder — never loads session config. Implement hard enforcement: load session repo from config, reject requests with mismatched repo. (priority: high)
- [ ] [review] Gate 1: `evaluatePolicy` does not guard against `base: main` — any request can target `main` branch. Add explicit rejection of operations targeting `main` per spec ("Anything targeting main → No → Rejected — human promotes to main"). (priority: high)
- [ ] [review] Gate 1: `issue-comment` and `pr-comment` lack scoped-target validation (comments say "Only on assigned issue" / "Only on PRs created by child" but no enforcement logic). `issue-close` for orchestrator assumes `aloop/auto` label without checking. Implement actual validation. (priority: high)
- [ ] [review] Gate 2: Expand `gh.test.ts` beyond 3 happy/near-happy scenarios to cover: missing request file, invalid JSON, unknown role/operation, orchestrator `issue-create` without `aloop/auto` label, denied operations emit exact `gh_operation_denied` reason, `base: main` rejection. (priority: high)
- [ ] [review] Gate 3: Add branch-coverage reporting for `gh.ts` and raise new-module branch coverage to >=90%; untested branches include request read/parse failures, unknown role/operation paths, orchestrator label-deny, and `main`-targeting rejection. (priority: high)

### Up Next

#### Proof Pipeline (Spec: Proof-of-Work Phase)
- [ ] Add `PROMPT_proof.md` template to scaffold/install paths. Template instructs agent to: read TODO.md, inspect commits, decide what proof is valuable/possible, generate artifacts, write `proof-manifest.json`. (priority: P1)
- [ ] Update `aloop/bin/loop.ps1` cycle from 5-step to 6-step (`plan -> build x3 -> proof -> review`). Update `Resolve-IterationMode` to include proof at position 4, adjust `cyclePosition` modulo from 5 to 6. (priority: P1)
- [ ] Update `aloop/bin/loop.sh` cycle from 5-step to 6-step with matching semantics (proof at position 4, modulo 6). (priority: P1)
- [ ] Implement proof artifact persistence in both loop runtimes — save artifacts to `~/.aloop/sessions/<id>/artifacts/iter-<N>/` and write `proof-manifest.json`. (priority: P1)

#### Convention-File Protocol (Spec: Security Model)
- [ ] Implement convention-file intake in `aloop/bin/loop.ps1`: at iteration boundaries, read `.aloop/requests/*.json`, delegate each to `aloop gh`, write `.aloop/responses/*.json`, archive processed requests to `.aloop/requests/processed/`. (priority: P1)
- [ ] Implement convention-file intake in `aloop/bin/loop.sh` with PowerShell parity (ordering, responses, archival behavior). (priority: P1)

#### Dashboard & UX (Spec: UX Improvements)
- [ ] Add missing dashboard command assets: `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`. (priority: P1)
- [ ] Implement `aloop start` CLI command (session creation, prompt copy, worktree/in-place, loop launch, active session registration). (priority: P2)
- [ ] Implement `aloop setup` CLI command as first-class interactive discover/scaffold flow. (priority: P2)
- [ ] Add `aloop discover --scope project|full` parity with Phase 2 schema expectations (project scope baseline + full provider/model enrichment). Currently no `--scope` parameter exists. (priority: P2)
- [ ] Refactor `/aloop:start` and `/aloop:setup` command/prompt files to thin wrappers that delegate to CLI-first `aloop start`/`aloop setup`. (priority: P2)
- [ ] Add `aloop status --watch` live refresh mode (argument parsing, refresh loop, graceful exit). (priority: P2)
- [ ] Implement `aloop start` auto-monitoring UX (`status --watch` terminal + dashboard/browser launch options from config). (priority: P2)

#### Dashboard Multi-Session & Redesign (Spec: UX Improvements)
- [ ] Add multi-session dashboard switching (`/api/state?session=<id>`, SSE rebinding, client session picker). (priority: P2)
- [ ] Replace tabbed dashboard core with dense single-page layout using required components (`ResizablePanel`, `HoverCard`, `Collapsible`, `Command`, `Sonner`) and keep mobile usability. (priority: P2)
- [ ] Add dashboard backend artifact endpoint (`/api/artifacts/<iteration>/<filename>`) with strict path safety checks. (priority: P2)
- [ ] Add dashboard proof artifact rendering (image thumbnail/expand + text/code viewer + before/after comparison widget). (priority: P2)

#### Orchestrator (Spec: Parallel Orchestrator Mode)
- [ ] Add `aloop orchestrate --plan-only` command to persist `orchestrator.json` decomposition and wave metadata. (priority: P2)
- [ ] Implement orchestrator dispatch core (issue creation via `aloop gh`, wave gating, concurrency cap, child loop launch/worktree mapping). (priority: P2)
- [ ] Implement orchestrator PR lifecycle (CI checks, agent review, merge/reopen, conflict retry budget). (priority: P2)
- [ ] Implement user-feedback triage loop (`actionable`, `needs_clarification`, `question`, `out_of_scope`) with blocked-on-human pause/resume and processed-comment tracking. (priority: P2)

#### Devcontainer Support (Spec: Devcontainer Support P1)
- [ ] Add `/aloop:devcontainer` skill files for Claude and Copilot command surfaces. (priority: P2)
- [ ] Implement devcontainer generation: project analysis, config generation, provider installation, verification loop. (priority: P2)
- [ ] Implement harness auto-detection of `.devcontainer/devcontainer.json` in both loop runtimes — route provider invocations through `devcontainer exec` automatically. (priority: P2)
- [ ] Implement shared container for parallel loops (single container, multiple worktrees, dynamic mount). (priority: P2)

#### Cleanup
- [ ] Remove or relocate root-level `reproduce_json_escape_issue.sh` into a test harness so repo root contains no leftover debug scripts. (priority: P3)
- [ ] Run final acceptance sweep against `SPEC.md` checkboxes and refresh TODO completion states based on actual code/tests. (priority: P3)

### Completed
- [x] [review] Gate 5: Fix regression baseline. `Invoke-Pester ./aloop/bin/loop.tests.ps1` fails at discovery with parse errors, and `install.tests.ps1` has failing tests. Restored full test suite green.
- [x] [review] Gate 1: `aloop/bin/loop.sh` PATH hardening removes whole directories that contain `gh`. Reworked sanitization to block `gh` without dropping provider executables.
- [x] [review] Gate 2: `aloop/bin/loop_path_hardening.tests.sh` misses critical cases; added behavioral tests for co-located provider binary and PATH restoration on non-zero exit.
- [x] [review] Gate 3: Add coverage-capable harness/reporting for shell branch paths and ensure touched runtime logic meets >=80% branch coverage. [gates 1-5 pass]
- [x] Add PowerShell parity for degraded provider handling in `Resolve-HealthyProvider` (`provider_skipped_degraded`, `all_providers_degraded`) and add matching Pester coverage.
- [x] Implement PATH hardening in `aloop/bin/loop.ps1`: prepend gh-blocking shim directory for provider execution windows and restore PATH afterward; 7 Pester regression tests.
- [x] Implement PATH hardening in `aloop/bin/loop.sh`: remove `gh` from PATH for provider execution windows and restore afterward; add regression tests.
- [x] Fix `aloop/bin/loop.sh` RETURN-trap leakage in `invoke_provider` (trap persists beyond function return and can clobber PATH for later commands); add regression coverage.
- [x] Add `aloop gh` command surface with hardcoded role policy scaffolding and audit log events (`gh_operation`, `gh_operation_denied`).
- [x] Unify the CLI entry surface so `aloop` routes through one implementation (`aloop.mjs` vs `dist/index.js`).
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
