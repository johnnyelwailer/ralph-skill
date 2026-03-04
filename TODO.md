# Project TODO

## Current Phase: Runtime Semantics + Security Boundary + Orchestrator Buildout

### In Progress

### Up Next
- [ ] Implement provider-health subsystem in `loop.sh` (`~/.aloop/health/<provider>.json`, cooldown/degraded transitions, exponential backoff, all-providers-unavailable sleep, lock-failure graceful path). Currently only `loop.ps1` has health. `loop.sh` has zero health file code. (P1)
- [ ] Add PATH sanitization around provider execution in both runtimes: strip `gh`/`gh.exe` directories from PATH before launching provider, restore after. Required by security model, currently absent from both `loop.ps1` and `loop.sh`. (P1)
- [ ] Add `aloop gh` subcommand to `aloop/cli/aloop.mjs` with hardcoded child-loop vs orchestrator policy, forced repo/base constraints, and audit events (`gh_operation`, `gh_operation_denied`). Currently no `gh` subcommand exists. (P1)
- [ ] Implement convention-file request/response processing in `loop.ps1`: read `.aloop/requests/*.json` at iteration boundaries, delegate to `aloop gh`, write `.aloop/responses/*.json`, archive processed files to `requests/processed/`. (P1)
- [ ] Implement equivalent convention-file processing in `loop.sh` with matching behavior, sequential numbering, and ordering guarantees. (P1)
- [ ] Add proof phase to loop cycle: create `PROMPT_proof.md` template, update cycle resolution in both `loop.ps1` and `loop.sh` to 6-step (plan → build×3 → proof → review), implement artifact saving to `artifacts/iter-<N>/`, write `proof-manifest.json`. Currently no proof infrastructure exists. (P1)
- [ ] Add `aloop start` CLI subcommand to `aloop.mjs`: session setup, worktree creation, loop launch, dashboard auto-start, browser open. Currently `/aloop:start` is a multi-step agent-orchestrated flow; spec wants a single CLI command. (P2)
- [ ] Add `aloop setup` CLI subcommand to `aloop.mjs`: interactive config creation wrapping `discover`+`scaffold`. Currently `/aloop:setup` is agent-orchestrated. (P2)
- [ ] Add `/aloop:dashboard` command file to `claude/commands/aloop/dashboard.md` and `copilot/prompts/aloop-dashboard.prompt.md`. Both are missing. (P2)
- [ ] Redesign dashboard UI for information density: single-page dense view (TODO + log + health + commits visible simultaneously, no tabs for core info), ResizablePanel, HoverCard, Collapsible, Command, Sonner. Current dashboard uses basic tabs. (P2)
- [ ] Add multi-session switching to dashboard: backend reads `active.json`, `GET /api/state?session=<id>`, SSE reconnect per session, sidebar click handlers, session cards with status badges. Currently single-session bound. (P2)
- [ ] Add `aloop status --watch` for terminal-based live monitoring with auto-refresh. (P2)
- [ ] Dashboard serves proof artifacts via `/api/artifacts/<iteration>/<filename>` with inline rendering, before/after comparison widget (side-by-side, slider, diff overlay), history scrubbing. (P2)
- [ ] Build `aloop orchestrate --plan-only`: persist orchestrator state (`orchestrator.json`) including spec decomposition into GitHub issues, dependency graph, and wave metadata. (P2)
- [ ] Add orchestrator dispatch loop: wave gating, concurrency cap (default 3), child worktree/branch creation, child loop launch, child status polling. (P2)
- [ ] Add orchestrator PR gate: automated checks (CI, coverage, conflicts, lint) + agent review + squash merge to `agent/trunk`, plus rejection/conflict rebase workflow. (P2)
- [ ] Extend `aloop status` with orchestrator tree view (orchestrator → children → issues → PRs) and provider-health summary. (P2)
- [ ] Implement user-feedback triage flow in orchestrator: classify comments (actionable/needs_clarification/question/out_of_scope), steer or clarify, `aloop/blocked-on-human` pause/resume, confidence thresholds, processed comment tracking. (P2)
- [ ] Resolve CLI constraint drift: repo has `aloop/cli/package.json`, `commander`, TypeScript source under `src/`, and `dist/` build artifacts. Spec mandates zero npm deps and `.mjs`-only. Either migrate TS commands to `.mjs` or formally amend spec. (P2)
- [ ] Run acceptance sweep against all SPEC acceptance criteria, update SPEC checkboxes, and reconcile Phase 0 `ralph` grep criterion (18 hits in SPEC.md are expected — spec text references the old name in examples). (P3)

### Completed
- [x] Capture and persist provider stderr details on failure in both runtimes. `loop.ps1` passes `$errorContext` to `Update-ProviderHealthOnFailure` but doesn't capture actual stderr separately per spec design (2>&1 split). `loop.sh` only stores `"<provider> exited with code N"` — no real stderr. Needed for accurate health classification. (P1)
- [x] Add phase-prerequisite enforcement in `loop.sh` (`phase_prerequisite_miss` logging): build requires unchecked TODO tasks, review requires builds since last plan. Already implemented in `loop.ps1` but completely missing from `loop.sh`. (P1)
- [x] Add CLAUDECODE env var sanitization in all entry points: `loop.ps1` top + `Invoke-Provider`, `loop.sh` top + `invoke_provider`, `aloop.mjs` entry. Spec requires defense-in-depth at both script top and per-invocation. (P1)
- [x] Core rename to `aloop` paths/commands is in place across runtime tree, installer paths, and prompt/command references.
- [x] `install.ps1` installs runtime under `~/.aloop/` and creates `aloop` CLI shims.
- [x] Native ESM CLI entry exists at `aloop/cli/aloop.mjs` with `resolve`, `discover`, `scaffold`, `status`, `active`, and `stop`.
- [x] Legacy `setup-discovery.ps1` was removed and setup flow now uses `discover`/`scaffold`.
- [x] Final-review completion gate behavior exists in both loops (`tasks_marked_complete`, `final_review_approved`, `final_review_rejected`).
- [x] Provider health primitives and round-robin health-aware selection are implemented in `aloop/bin/loop.ps1`.
- [x] Retry-same-phase semantics implemented in `loop.ps1` (success-driven `cyclePosition`, forced-flag precedence, phase prerequisites, max phase-retry safety valve with `phase_retry_exhausted`).
- [x] Retry-same-phase semantics mirrored in `loop.sh` (`advance_cycle_position`, `PHASE_RETRY_CONSECUTIVE`, `MAX_PHASE_RETRIES`, `phase_retry_exhausted`).
- [x] Phase-prerequisite enforcement implemented in `loop.ps1` (`Check-PhasePrerequisite` with `phase_prerequisite_miss` for build-needs-tasks and review-needs-builds).
