# Orchestrator

> **Reference document.** The contract for orchestrator sessions — how a spec becomes tracked work, how children are dispatched, how results are gated and merged, how self-healing happens. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues (or the configured tracker).
>
> Sources: SPEC.md §Parallel Orchestrator Mode, §State Machine, §Budget; SPEC-ADDENDUM.md §Adapter Pattern, §Scan Agent Self-Healing, §Orchestrator Autonomy Fix, §PR Review, §Self-Healing, §Session Resumability (pre-decomposition, 2026-04-18). Consolidated against `daemon.md`, `api.md`, `pipeline.md`, `work-tracker.md`.

## Table of contents

- Concept
- Orchestrator is a session, not a program
- Inputs, outputs, and the tracker abstraction
- State machine
- Refinement pipeline
- Dispatch
- Monitor + gate + merge
- Replan and redispatch
- Agent-trunk branch
- Budget and quota awareness
- Self-healing via diagnose workflow
- Autonomy levels
- Resumability
- Per-task environment requirements
- Conflict resolution
- Invariants

---

## Concept

An orchestrator session decomposes a spec (one or more files) into tracked work items, launches child sessions per item in their own worktrees, reviews the resulting change sets against hard criteria, merges the approved ones into an agent-owned trunk branch, and repairs failures through an intelligent diagnose loop.

Human promotes `agent/trunk` to the project's mainline when satisfied.

```
          spec files (SPEC.md, docs/spec/*.md, etc.)
                              │
                              ▼
                    ┌──────────────────┐
                    │ orchestrator     │  kind=orchestrator, workflow=orchestrator.yaml
                    │ session          │  runs in aloopd like any other session
                    └─────────┬────────┘
                              │
                decompose → refine → estimate → dispatch
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
       Epic 10             Epic 20            Epic 30
       (work item)         (work item)        (work item)
       │  │  │              │  │                │
     Story Story Story   Story Story        Story
     ↓     ↓     ↓        ↓     ↓            ↓
     Child Child Child    Child Child         Child
     ─ each a session of kind=child, own worktree, own workflow ─
       │  │  │              │  │                │
       CS1 CS2 CS3         CS4 CS5            CS6 CS7   (change sets — PRs/MRs/branches)
           └────────────────┬────────────────────┘
                            ▼
                    ┌──────────────────┐
                    │ orchestrator     │  monitor → gate → merge → diagnose
                    └─────────┬────────┘
                              ▼
                      agent/trunk branch
                              │
                      human promotes to main
```

## Orchestrator is a session, not a program

The orchestrator is **not** a separate binary, a separate runtime, or a separate process. It is a session of kind `orchestrator` running a workflow like any other. The same `aloopd` that runs a standalone plan-build-review session runs the orchestrator.

Practical consequences:

- The orchestrator uses the same scheduler, the same provider adapters, the same event bus, the same compile step, the same `aloop-agent` CLI, the same HTTP API.
- Its "brain" is the collection of prompts referenced by `orchestrator.yaml` (see `pipeline.md` §Orchestrator as a workflow). The brain is data, not code.
- It creates children via `POST /v1/sessions` with `kind: child` and `parent_session_id: self.id`. Nesting is capped at one level (see `api.md` §Sessions §Create for the canonical "no grandchildren" rule).
- It observes children via `GET /v1/events?parent=<self.id>` (SSE). Self-healing is a *workflow* that subscribes to events and queues diagnose prompts — not a daemon-side daemon.
- It has no worktree, or it uses project root read-only. Its work is API calls, not file edits.

## Inputs, outputs, and the tracker abstraction

The orchestrator never speaks to GitHub, GitLab, Linear, or any tracker directly. It speaks in the abstract vocabulary defined by `work-tracker.md`: `WorkItem` (with `kind: epic | story | task_mirror | other`), `ChangeSet`, `Comment`, `Review`, abstract labels (`priority_critical`, `change_request`, `epic`), abstract statuses (`needs_refinement`, `refined`, `in_progress`, `in_review`, `done`).

The hierarchy is **Epic → Story → Task**:

- **Epic** is a top-level tracked issue (`kind: epic`) — a shippable increment.
- **Story** is a sub-issue of an Epic (`kind: story`) — dispatched to exactly one child session.
- **Task** is session-internal work (`aloop-agent todo`) generated during a Story's child session by the plan agent, consumed by build/qa/review agents. Tasks are **not** tracked externally by default.

Where the tracker supports native sub-issue APIs (GitHub as of 2025-04-09, GA), the adapter uses them. Where it doesn't, the adapter falls back to `links.parent` metadata. Orchestrator prompts never see the difference.

The daemon's `TrackerAdapter` (GitHub, builtin, or future GitLab/Linear/etc.) translates abstract vocabulary into tracker-native operations.

**Orchestrator prompt outputs** are all tracker-agnostic JSON submitted via `aloop-agent submit`:

| Submit type | Meaning | Tracker-side effect |
|---|---|---|
| `decompose_result` | List of Epics with dependencies, waves, slugs | Adapter creates top-level issues with `kind: epic` |
| `sub_decompose_result` | List of Stories under one Epic | Adapter creates issues with `kind: story` and links as sub-issues of the Epic |
| `refine_result` | Epic or Story with scope tightened, constraints added, DoR fields set | Adapter updates issue body and status metadata |
| `estimate_result` | Complexity tier + dependency graph adjustments | Adapter updates metadata / labels |
| `review_result` | Verdict + per-file findings + thread locations | Adapter posts change-set comments and resolves threads |
| `merge_request` | Approved change set ready to merge | Daemon (not adapter) calls `mergeChangeSet` per policy |

Orchestrator prompts **never** include raw tracker URLs, tracker-specific labels, or API calls in their body. Prompts may reference issues by `slug` (decomposition) or by `ref` (`{adapter, key}`) after creation.

## State machine

The orchestrator cycles through a scan heartbeat that reacts to tracker events and child session events:

```
  ┌────────── scan ──────────┐
  │   (reads tracker state,  │
  │    listens to events)    │
  │                          │
  ▼                          │
decompose_needed? ── yes ──→ decompose → refine → estimate ─┐
  │ no                                                      │
  ▼                                                         │
dispatchable issues > 0? ── yes ──→ dispatch ───────────────┤
  │ no                                                      │
  ▼                                                         │
child change sets open? ── yes ──→ monitor + gate + merge ──┤
  │ no                                                      │
  ▼                                                         │
all done?  ── yes ──→ completed                             │
  │ no                                                      │
  └──────────────── back to scan ←─────────────────────────┘

At any point:
  child_stuck | burn_rate_exceeded | merge_conflict_pr | pr_review_needed
              → queue triggers.<name> → diagnose or specialized prompt
```

The state machine is encoded in `orchestrator.yaml` as cycle + triggers, not in code. The session runner executes it mechanically. Every orchestrator turn goes through the scheduler like any other turn (see `daemon.md` §Scheduler authority).

## Refinement pipeline

Five phases, each a separate prompt. Each phase emits a tracker-agnostic submit type. The pipeline produces the Epic → Story structure; Tasks come later, inside each Story's child session.

### Global spec analysis (`PROMPT_orch_product_analyst.md` or similar)

Runs once per session (or when spec files change). Input: the project's spec files (paths from `aloop/config.yml`). Output: high-level theme map, out-of-scope list, major dependencies. No tracker side effect.

### Epic decomposition (`PROMPT_orch_decompose.md`)

Breaks the spec into **Epics** — coarse vertical slices, each representing a shippable increment. Emits `decompose_result` with `kind: epic` and `abstract_status: needs_refinement`. Adapter creates top-level issues.

### Epic refinement (`PROMPT_orch_refine.md`)

For each Epic, tighten scope and acceptance criteria, list out-of-scope items, identify constraints. Emits `refine_result` with `abstract_status: refined`. Adapter updates the issue body.

### Story decomposition (`PROMPT_orch_sub_decompose.md`)

For each refined Epic, produce **Stories** — the unit a child session will pick up. Each Story carries `dependencies` (slugs of other Stories, potentially in other Epics), optional `wave` index, and `estimated_complexity` tier. Emits `sub_decompose_result` with the parent Epic's slug and an array of `kind: story` issues. Adapter creates each Story as a sub-issue of the Epic — via the tracker's native sub-issue API where available (GitHub's `POST /repos/{owner}/{repo}/issues/{epic_number}/sub_issues`), via `links.parent` metadata otherwise.

### Story refinement (`PROMPT_orch_refine.md` with story scope)

For each Story, validate definition-of-ready (tests named, files in scope identified, external contracts referenced, environment requirements declared). Emits `refine_result` with `abstract_status: dor_validated`. Only `dor_validated` Stories are dispatchable.

Tasks are **not** produced by the orchestrator. Tasks are generated inside a Story's child session by the plan agent, tracked via `aloop-agent todo`, and consumed by build/qa/review. Mirroring tasks to the tracker is an optional per-project feature (see `work-tracker.md` §Task tracking).

Throughout: **agents see no tracker specifics.** All tracker writes happen daemon-side through the adapter.

## Dispatch

The dispatcher is a prompt (`PROMPT_orch_dispatch.md` or similar) that:

1. Reads tracker state via `aloop-agent tracker list --kind story --status dor_validated --wave current`.
2. For each dispatchable Story, checks:
   - Parent Epic is `refined` (or `dor_validated`).
   - Dependencies satisfied (all blocking Stories `done`, possibly across Epics).
   - Wave gate — higher waves wait until lower waves' critical paths are merged.
   - Scheduler permit for the child session can be acquired (concurrency, system, quota, burn-rate gates all pass).
   - Override policy permits a provider for this Story's chain.
3. Emits `dispatch_result` — a list of `{story_ref, workflow, provider_chain}` tuples.
4. Daemon processes the submit: for each tuple, `POST /v1/sessions` with `kind: child`, `parent_session_id: orch.id`, `workflow: <workflow>`, `provider_chain: <chain>`, `issue: <story_ref>`.
5. Daemon creates the child's worktree (branch `aloop/issue-<story_key>`, based on `agent/trunk`) and starts the child's session runner.

The dispatcher does not spawn processes. It submits intent. The daemon does the work.

## Monitor + gate + merge

When a child session produces a change set and signals readiness:

1. Child submits a final `build_result` or reaches its workflow's `completed` state. Daemon records it.
2. Orchestrator observes via `tracker.event` (`change_set.opened` or `change_set.updated`) and event bus (`session.completed`).
3. Orchestrator queues `PROMPT_orch_review.md` via `triggers.pr_review_needed`.
4. Review prompt outputs `review_result` with verdict `approved | changes_requested | reject`.
5. Daemon applies the verdict:
   - **approved** → orchestrator queues `merge_request` submit; daemon calls `mergeChangeSet` per project policy (squash by default). Story moves to `done` via `status_map`.
   - **changes_requested** → daemon posts review comments/threads via the adapter; child session gets its queue populated (`triggers.pr_review_requested` or similar) with the review body, resumes work.
   - **reject** → issue moves back to `refined` or `needs_refinement`; the orchestrator may redispatch or escalate.
6. After merge, orchestrator emits `merge_complete` event; reconcile job updates aggregate state.

**Policy enforcement:**

- Children can create change sets and post comments but can never merge. Merge is a daemon-level operation gated on an approved `review_result` submitted by an agent with role `review` (or `final-review`).
- Merge mode per project config (`merge_mode: squash | merge | rebase`).
- Merge requires: mergeability check passing, tracker's CI required checks green (if configured), review verdict `approved`.

## Replan and redispatch

When a merge lands, downstream issues may have become more or less feasible. The orchestrator's scan cycle re-evaluates:

- **New dependencies discovered** during implementation → add issue / edit issue via adapter.
- **Scope drift** (child ran long, produced extras) → orchestrator queues a `refine` on affected issues.
- **Stale issues** (prereqs changed under them) → status reverts to `needs_refinement`.
- **Failed issues** (child session ended `failed`) → orchestrator decides: redispatch (new child, same issue), refine (scope is wrong), or pause (systemic problem → diagnose).

Redispatch is always a **new child session**. The old session's events, logs, and change set (if any) are retained for post-mortem.

## Agent-trunk branch

Child change sets target `agent/trunk`, not `main`/`master`.

- `agent/trunk` is the orchestrator's merge target. All dispatched work lands there.
- Human promotes `agent/trunk` → mainline at their cadence (PR from trunk, external tests, etc.). Aloop does not touch mainline.
- On `agent/trunk` divergence from mainline (human lands something directly on main), the orchestrator's reconcile job can trigger a rebase via an adapter operation (`updateChangeSetBranch` on `agent/trunk` itself, or a dedicated `sync_trunk` prompt).

Multi-project: each project has its own `agent/trunk` by default; name configurable in `aloop/config.yml`.

## Budget and quota awareness

The orchestrator does not implement budget tracking itself. It consumes the scheduler's signals:

- **Cost aggregates** per session and per orchestrator rollup come from the daemon (SQLite `sessions.cost_usd` summed by parent).
- **Budget cap** per orchestrator session comes from project config (`budget_cap_usd`). When cost crosses 80% of cap, scheduler starts denying permits for new children; the orchestrator's scan observes the denial, pauses dispatch, and queues `PROMPT_orch_diagnose.md` to decide action (raise cap, stop, continue with reduced scope).
- **Per-provider quota** is a scheduler concern. Orchestrator reads `GET /v1/providers` when deciding which chain to use for a dispatch; prefers providers with quota headroom and positive health.
- **Burn rate** per child is a scheduler gate. On denial (`burn_rate_exceeded`), scheduler notifies the orchestrator, which queues `PROMPT_orch_diagnose.md` with the child ref and the burn metrics.

## Self-healing via diagnose workflow

No daemon-side auto-healing. The heartbeat-auto-fix pattern (external systemd timer filing GH issues) is retired. In its place: an **intelligent diagnose workflow** that runs as a prompt.

Flow:

1. Anomaly observed — either by daemon watchdog (stuck child, permit cascading denials, burn rate, quota exhaustion) or by orchestrator's own observation of the event bus (repeated failures on a specific issue, CI red after merge).
2. Anomaly emits an event with a canonical classification.
3. Orchestrator workflow's triggers map the classification to `PROMPT_orch_diagnose.md` (or a more specific diagnose prompt).
4. The daemon queues the prompt into the orchestrator's own queue.
5. On next turn, the diagnose prompt runs — it reads the event context, session state, recent logs, and emits a structured action:
   - **`pause_dispatch`** — halt new children until a human acts.
   - **`pause_session <id>`** — pause one child; emit a steering prompt into its queue explaining why.
   - **`stop_session <id>`** — terminate a specific child with reason.
   - **`raise_threshold <gate> <value>`** — orchestrator is confident the gate is misconfigured; adjust via `PUT /v1/scheduler/limits`.
   - **`redispatch <issue_ref>`** — try again with a different chain/worktree.
   - **`file_followup_issue <issue_draft>`** — create a new tracked issue summarizing the anomaly for human triage.
   - **`no_action`** — diagnose decided the event is expected; log and continue.

Every action is mediated by the daemon. The diagnose prompt cannot directly kill a process, merge a PR, or bypass policy. It expresses intent.

Common triggers:

| Event | Trigger keyword | Typical diagnose action |
|---|---|---|
| `session.stuck` (child) | `child_stuck` | `pause_session` + steering prompt |
| `scheduler.burn_rate_exceeded` | `burn_rate_alert` | `pause_session` or `file_followup_issue` |
| `provider.health` → `degraded` | `provider_degraded` | `raise_threshold`, `file_followup_issue` |
| `change_set.review_submitted` (external reviewer) | `pr_review_needed` | run full review prompt, act on verdict |
| `merge_conflict_pr` | `merge_conflict_pr` | queue `PROMPT_orch_resolver.md` on the child's queue |

## Autonomy and human intervention

**Aloop is autonomous by default.** There are no attended / supervised / tier-switch modes. The orchestrator proceeds end-to-end: decompose, dispatch, review, merge, diagnose — without pausing for approval. The whole point is that you can go to sleep and come back to merged work.

Humans intervene through **five channels**, any time, without stopping the loop:

1. **Steer** a session — `POST /v1/sessions/:id/steer`. Queues a prompt into the session's own queue; picked up on the next turn. The session does not stop; it takes the instruction into account.
2. **Stop** a session — `DELETE /v1/sessions/:id?mode=graceful|force`. Graceful finishes the current turn, force kills the provider. Orchestrator stop cascades to children.
3. **Edit an Epic / Story** — in the tracker directly (GitHub UI) or via `aloop tracker ...` CLI. The orchestrator reads the current state on every scan; changes take effect on the next refinement or dispatch decision.
4. **Edit a Task** — `aloop-agent todo` from a shell attached to the session's worktree, or via the dashboard. Tasks are session-internal; the session picks up the change on the next turn.
5. **Comment on an Epic or Story** — first-class interaction channel (see §Epic/Story conversations). The orchestrator reads human comments on tracked items and decides what to do about them.

The daemon enforces that humans always have these channels available; nothing an agent does can strip them. A runaway session is always stoppable; a wrong decomposition is always editable; a misunderstood scope is always steerable.

## Epic/Story conversations

Humans can comment on any Epic or Story in the tracker. Those comments are first-class input to the orchestrator — not noise to ignore.

**Flow:**

1. A human leaves a comment on an Epic or Story via the tracker UI (GitHub issue comment, GitLab issue comment, built-in tracker append).
2. The `TrackerAdapter` emits a `comment.created` event on the bus. The event payload includes the comment body, the author, the work item ref, and `source: "human"` (derived from the author — the adapter filters out comments authored by the aloop identity itself to avoid self-reaction loops).
3. The orchestrator workflow's `triggers.user_comment` maps to `PROMPT_orch_conversation.md`. The daemon queues it into the orchestrator's own queue.
4. On next turn, the conversation prompt runs. Inputs: the comment, the full Epic/Story body, all prior comments (human and orchestrator), current abstract status, linked Stories and change sets.
5. The prompt emits `conversation_result` with a structured action:
   - **`reply`** — post a comment back via `adapter.addComment`. The orchestrator identity authors it; adapter stamps metadata so future events don't trigger re-reaction.
   - **`edit_work_item`** — update title / body / labels / status. Goes through `adapter.updateWorkItem` under policy.
   - **`refine_again`** — move the work item back to `needs_refinement` and re-queue `PROMPT_orch_refine.md`.
   - **`decompose_again`** — for Epics: move back to `refined` and re-queue `PROMPT_orch_sub_decompose.md` to re-split.
   - **`pause_dispatch_for <work_item>`** — do not dispatch children for this item until a further signal.
   - **`inject_into_child <session_id> <instruction>`** — queue a steer into a running child session linked to this work item.
   - **`file_followup <draft>`** — create a new Epic or Story.
   - **`no_action`** — comment was informational; record and continue.

Every action is policy-gated. The conversation prompt cannot directly edit history, delete comments, or merge change sets — it expresses intent; the daemon decides what is permitted for the orchestrator role.

**Infinite-loop prevention:** orchestrator-authored comments are flagged by metadata at create time; the `user_comment` trigger filters them out. Human → orchestrator → human → orchestrator conversations are fine and expected; orchestrator → orchestrator is not.

**Why this matters:** the comment channel is how humans actually steer long-running work. "This Epic is too big — split it into three" or "Story 42 is blocked on an external decision, pause it for a week" or "You got the API shape wrong, use X instead." Without this, humans have to edit the work item body (which agents may overwrite) or intervene procedurally (which breaks the autonomous promise). With it, conversations live alongside the work, visible to everyone, and the orchestrator listens.

Autonomy level is a daemon-enforced policy, not a prompt-level suggestion. It gates merge authority, threshold-change authority, and dispatch without refinement.

## Resumability

Orchestrator sessions survive daemon restarts and explicit stops.

On daemon start:

- Sessions with `status=running` move to `interrupted`.
- JSONL tail replay reconstructs: open children list, pending issues, in-flight permits (released on restart; retry next cycle), last queue position.
- Orchestrator can be resumed via `POST /v1/sessions/:id/resume`.

What persists:

- Tracker state is authoritative for work items (via adapter).
- Daemon state (SQLite) holds orchestrator own queue, aggregates, child session indices.
- JSONL holds full event history for replay.

Child sessions follow the same resume semantics as standalone sessions (see `daemon.md` §Lifecycle).

## Per-task environment requirements

Some issues need special environments: vision support, a specific Node version, a devcontainer, a database. The orchestrator reads the issue's `metadata.environment_requirements` (set during refinement) and includes them in the dispatch:

- If `requires_vision: true` → chain must filter to providers with `capabilities.vision`.
- If `devcontainer: true` → the daemon spawns the child inside the project's devcontainer (see `devcontainer.md`).
- If `node_version: "22"` → the devcontainer or worker VM must provide it; failure to provide emits `dispatch_infeasible`.

Dispatch never blindly launches a child into the wrong environment. An infeasible dispatch halts with a diagnose trigger.

## Conflict resolution

When a change set's mergeability status becomes `no` (conflicts with `agent/trunk`):

1. Adapter emits `change_set.conflict`.
2. Orchestrator queues `PROMPT_orch_resolver.md` via `triggers.merge_conflict_pr`.
3. The resolver prompt decides: rebase (most cases), recreate (scope drift so large rebase is futile), or abandon (send back to `refine`).
4. Rebase decisions queue `triggers.merge_conflict` into the **child's** queue so the child's next turn resolves conflicts within its own workflow. Rebase is never performed by the orchestrator on the child's branch directly — the child owns its branch.
5. Recreate means: close the current change set via adapter, clean up worktree (session end), redispatch.

This keeps the conflict-resolution responsibility at the child level while the orchestrator only chooses strategy.

## Invariants

1. **Orchestrator is a session.** No separate binary, no special runtime, no privileged code path.
2. **Orchestrator never touches tracker APIs directly.** All tracker operations go through the configured `TrackerAdapter`.
3. **Orchestrator prompts are tracker-agnostic.** Generic data shapes only.
4. **Orchestrator has no worktree**, or uses project root read-only.
5. **Children are dispatched via the API.** `POST /v1/sessions` with `kind: child` and `parent_session_id`. No privileged dispatch path.
6. **No grandchildren.** API enforced.
7. **Merge authority is daemon-level**, gated on an approved `review_result` and project merge policy. Children can never merge.
8. **Self-healing is a workflow, not a daemon.** Intelligent diagnose prompts decide actions; daemon executes them under policy.
9. **Autonomy gates are daemon-enforced**, not prompt-level suggestions.
10. **Resume is always possible** — state reconstructs from JSONL + tracker + SQLite.
11. **The orchestrator survives tracker adapter swap.** Moving a project from `github` to `builtin` (or vice versa) is a config change; the orchestrator keeps working because its vocabulary is abstract.
