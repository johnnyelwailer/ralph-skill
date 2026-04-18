# Change-Request Synthesis for `next` Rebuild

Working document. Reflects the 28 open `aloop/change-request` issues (heartbeat-auto-fix excluded) plus 6 `aloop/priority-critical` issues as of 2026-04-18.

## Summary

The CR backlog collectively describes a **thin-shell / fat-runner** architecture: `loop.sh`/`loop.ps1` shrink to lock-and-invoke shims (#278, #287), and a single `aloop-runner` owns work selection, provider fallthrough, and policy enforcement (#287). Providers are a first-class ordered chain with mandatory per-turn fallthrough; round-robin is expressed only as explicit loop-plan variants, never as a runtime mode (#287, #288, #302). Agents communicate through a validated CLI (`aloop-agent`) that manages routed task state in the session dir, eliminating TODO.md markdown parsing and worktree-fragile state (#135, supersedes #283). Everything is data-driven from config, with zero hidden hardcoded thresholds (#94, #133, #191, #290). A constitution layer (#233) and comment-driven PR lifecycle (#192, #134) close the loop between intent, enforcement, and feedback.

## Engine & Scheduler

- **#287** aloop-runner — mandatory per-turn provider fallthrough; round-robin only via plan variants; runner owns queue-vs-cycle selection.
- **#278** loop.sh/ps1 < 400 LOC — all logic in runtime/runner.
- **#290** runtime throttling — daily/window budgets, min turn interval, concurrency cap.
- **#288** runtime provider override — hot-reloadable force/allow/deny at turn boundaries.
- **#133** queue priority manifest `queue-order.json` — tier-based, runtime-written.
- **#94** pipeline fully data-driven — no hardcoded intervals/caps.
- **#129** resource limits — dead-worktree prune, memory-pressure gate on dispatch.

**Collective demand:** single runner binary that executes one turn end-to-end (select → resolve chain → attempt → fallthrough → record), gated by runtime policy, zero decision logic in shell.

**MVP cut:** #287 + #278 + #133 + #94. Defer #290, #288, #129 — they refine an already-running system.

## Provider Model

- **#287** single `provider` field grammar `provider[/track][@version]`, ordered-array chain, canonical failure classes.
- **#191** fine-grained model config per provider/agent via pipeline.yml + compile step.
- **#302** provider load-balancing across parallel loops.
- **#288** runtime override (force/allow/deny).
- **#299** (dashboard) provider management UI.

**Collective demand:** providers are ordered chains resolved by precedence (queue > plan > frontmatter > default), attempted in same turn with structured failure classification. Health/quota/cooldown are first-class runtime state shared across sibling loops.

**MVP cut:** #287 + #191. #302 is near-MVP since parallel dispatch across providers is the core rebuild promise. Defer #299, #288 to post-MVP.

## Agent Contract

- **#135** replace file-based contracts with `aloop-agent` CLI (submit + todo) — validated, role-permissioned, session-dir task store. Supersedes TODO.md parsing.
- **#46** agents platform-neutral — no GitHub knowledge leaks into prompts.
- **#48** tessl skill discovery in setup + per-task install before dispatch.
- **#283** child working-files backup/restore — explicitly marked superseded by #135 by its own author.

**Collective demand:** agents are untrusted, platform-neutral CLI consumers. Task state lives in session dir (survives git clobber). `from`/`for` routing replaces role enums.

**MVP cut:** #135 + #46. Defer #48. Close #283 (obsoleted).

## Orchestrator

- **#275** wave scheduling + focus mode + user reprioritization (labels, steer).
- **#127** self-healing — GH failures queued in `pending-sync.json`, no `state=failed` from transient errors.
- **#192** PR lifecycle comment-driven not SHA-driven.
- **#134** inline PR review (GH reviews API + GraphQL thread resolution).
- **#130** investigator agent — spec-vs-reality gap discovery.
- **#93** setup = strict readiness gate.
- **#47, #45** QA end-to-end flows; duplication/SoC/dead-code scanners before proof.

**Collective demand:** orchestrator is a stateful scheduler: `orchestrator.json` is source of truth, GH is sync target, dispatch is wave/priority-ordered, gated on memory + focus-mode, PR reviews are comment streams with inline resolution.

**MVP cut:** #275, #127, #192, #93. #134 is near-MVP. Defer #130, #47, #45.

## Layout & Paths

No dedicated CR, but the implicit layout across #135, #287, #133 is:
- `.aloop/bin/aloop-agent` (agent CLI in PATH)
- `$SESSION_DIR/tasks.json`, `$SESSION_DIR/pending-sync.json`, `$SESSION_DIR/gh-health.json`, `$SESSION_DIR/backups/` (session-dir as runtime-owned state)
- `$SESSION_DIR/queue/*.md` + `$SESSION_DIR/queue/queue-order.json`
- `.aloop/output/*.json` (agent result drop)
- `.aloop/pipeline.yml`, `.aloop/config.yml` (data-driven config)

**MVP cut:** adopt the session-dir-as-runtime-state rule from day one.

## Dashboard

- **#294** epic: full-featured dashboard (React + shadcn).
- **#297–#301** streaming chat, Kanban, provider mgmt, loop control, settings.
- **#296** Telegram bot — CLI parity + streaming chat.
- **#295** self-healing orchestrator (body is stub).

**Collective demand:** control-plane UI over health/state files (pause/resume/dispatch/reorder/switch provider).

**MVP cut:** **none.** Rebuild direction is reuse-Archon; `next` MVP exposes file contracts (gh-health.json, orchestrator.json, queue-order.json) any dashboard can read.

**Obsolete candidates:** #295 stub; #297–#301 likely absorbed into Archon adoption.

## Constitution

- **#233** CONSTITUTION.md generated at setup from SPEC + user prefs, referenced via `{{CONSTITUTION}}` template variable, enforced by refine/review agents, amendable.

**MVP cut:** yes — the constitution is already driving half of these CRs' "Constraints" sections. `next` should scaffold it from day one.

## Other / Windows

- **#190** Windows loop.ps1 parity audit with loop.sh. With #287 the shims become tiny, so parity becomes trivial — this CR naturally resolves if loop.sh/ps1 are both ~100 LOC lock+invoke shims.

## MVP Checklist for `next` First Running Loop

1. **Runner binary** that executes one turn end-to-end with queue-first selection (#287).
2. **Provider chain grammar** `provider[/track][@version]` resolved by precedence (queue > plan > frontmatter > default) (#287, #191).
3. **Mandatory per-turn fallthrough** across ordered chain with canonical failure classes (#287).
4. **Loop shims** `loop.sh`/`loop.ps1` as <150 LOC lock+invoke+signal wrappers, automatic parity (#278, #190).
5. **aloop-agent CLI** with `submit` + `todo add/dequeue/complete/all-done/list --format md`, role-permissioned, session-dir storage (#135).
6. **Compile-step resolution** from pipeline.yml → loop-plan.json — all model/provider/priority resolved before shell sees it (#191, #94).
7. **Queue manifest** `queue-order.json` with tier-based ordering, runtime-written, loop-read (#133).
8. **Orchestrator dispatch** sorted by wave → priority → dependency depth, with focus mode and memory-pressure gate (#275, #129).
9. **Parallel dispatch across providers** — at least two children on different providers in the first demo (#302, delivers the core rebuild promise).
10. **CONSTITUTION.md** scaffolded at setup and piped into prompts via `{{CONSTITUTION}}` (#233).

## Close List (obsoleted by rebuild direction)

- **#283** — author declares it superseded by #135; tasks.json in session dir removes the root cause. Close with link to #135.
- **#295** — body is a stub with only UI-design boilerplate; "self-healing" is covered by #127 (GH-sync) and #129 (resource) more concretely. Close as duplicate/stub.
- **#294, #297–#301** — dashboard rebuild contradicts the "reuse Archon dashboard" direction. Recommend closing the epic and filing a single "expose file contracts for Archon dashboard" issue; alternatively retarget to `dashboard` repo.
- **#48** (tessl) — not obsolete, but entirely out-of-scope for `next` MVP; defer.
- **#190** — auto-resolves once #287+#278 land; close as "fixed by rebuild" after verification.

## Carry-Forward (prioritized for `next` MVP)

1. **#287** aloop-runner + provider chain + fallthrough — foundation.
2. **#135** agent CLI + session-dir task store — agent contract.
3. **#278** loop shim minimization — enforced by implementation, not refactor.
4. **#94** data-driven pipeline — compile-step is the sole resolver.
5. **#191** compile-step model resolution — tied to #94.
6. **#133** queue priority manifest.
7. **#275** wave + focus dispatch ordering.
8. **#302** provider load-balancing across parallel children — delivers the promise.
9. **#233** constitution system.
10. **#93** strict setup readiness gate.
11. **#127** orchestrator self-healing / `pending-sync.json`.
12. **#46** platform-neutral agent prompts.
13. **#192** comment-driven PR lifecycle.
14. **#129** resource-pressure dispatch gating.
15. **#134** inline PR review (post first-green-loop).
16. **#288** runtime provider override policy (post-MVP).
17. **#290** runtime throttling (post-MVP).
18. **#130, #47, #45** investigator/QA/finalizer depth (post-MVP).

## Conflicts

- **Round-robin mode.** #287 forbids a runtime round-robin mode. #302 is compatible only as orchestrator-level dispatch distribution, not a runner mode.
- **In-repo dashboard vs Archon-reuse.** #294 + #297–#301 assume a rebuilt in-repo dashboard. Conflicts with "reuse Archon" direction. Resolve by closing the epic or moving to the dashboard-consumer repo; `next` only commits to file contracts.
- **Fork vs patterns.** #134 (inline review UI) and #294 (streaming chat) risk fork-of-Archon behavior instead of patterns-only reuse. Keep `next` on the pattern side.
- **Provider preference order.** No CR encodes opencode > copilot > codex > gemini > claude; #287 examples lead with `claude/opus`. Treat #287 frontmatter as illustrative; pin the real chain in `aloop/config.yml`.
- **loop.sh modifications in #45, #48, #133, #283.** Several CRs still call for loop.sh edits ("materialize PR diff", "read manifest inline", "restore from backup"). Under #278/#287, loop.sh holds none of these — re-scope each into the runner.
- **#283 vs #135.** Only a conflict if implemented separately; close #283 once #135 lands.
- **Focus mode + parallel dispatch.** #275 caps in-flight work; #302 spreads concurrent loops across providers. Compatible only if focus mode caps concurrency and the load-balancer distributes within that cap — state this in SPEC.
