# Work Tracker

> **Reference document.** The generic work-tracking contract. GitHub is the first-class shipped adapter. The contract is tracker-agnostic; any project can swap adapters — or run with no external tracker at all using the built-in file-based store. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> The name "work tracker" (not "issue tracker") is deliberate — "issue" is GitHub's term for a single entity type, whereas aloop models **Epic**, **Story**, and **ChangeSet** as distinct work items. GitLab calls them issues/MRs/epics, Linear calls them issues/projects, Jira calls them stories/epics, plain text calls them tasks. "Work item" is the abstract vocabulary.
>
> Sources: CR #46 (agents must have zero knowledge of GitHub), CR #130 (investigator agent), CR #134 (inline PR review), CR #192 (comment-driven PR lifecycle), CR #169 (change request workflow), SPEC.md §`aloop gh` (moved to `security.md` as policy table), §Parallel Orchestrator decomposition; GitHub sub-issues API (GA 2025-04-09).

## Table of contents

- Why an abstraction
- Trust boundary
- Hierarchy: Epic → Story → Task
- Adapter interface
- Generic data shapes
- Abstract status and label mapping
- Task tracking
- Built-in adapter (no external deps)
- GitHub adapter (native sub-issues)
- Orchestrator-facing contract (generic decomposition schema)
- Events
- Configuration
- Multi-project
- Future adapters
- Invariants

---

## Why an abstraction

The orchestrator's job is to break a spec into tracked work items, dispatch loops against them, merge their changes, and react to review feedback. Those concepts exist in GitHub, GitLab, Linear, Jira, self-hosted Gitea, Forgejo, and inside any plain-text project that just wants a queue. Hardcoding GitHub forces aloop users into one platform; embedding `gh` CLI calls throughout the orchestrator makes the code brittle to upstream changes and impossible to use offline.

Aloop isolates the tracker behind a single `TrackerAdapter` interface. Orchestrator prompts and workflows speak in terms of generic **Epics**, **Stories**, **Tasks**, and **ChangeSets** — the adapter translates to the tracker's native concepts.

The contract is:

- One adapter per tracker.
- One active adapter per project (selectable in `aloop/config.yml`).
- All orchestrator interactions go through the adapter.
- Adapters are the only code that speaks tracker-native API.

## Trust boundary

Same boundary as all other aloop side effects. Agents do not call `gh`, `glab`, Linear API, or any tracker CLI. Agents **express intent** through `aloop-agent submit --type <decompose|refine|estimate|review|...>`; the daemon routes that intent to the active `TrackerAdapter`, which executes the operation under a policy that the daemon enforces.

- Agent → `aloop-agent submit` → daemon → adapter → tracker API
- Agent → *never directly* → tracker API

Policy enforcement (allow-list of operations, rate limiting, identity) lives in the daemon, not the adapter. Adapters are dumb executors of already-vetted commands.

## Hierarchy: Epic → Story → Task

Aloop models work at three levels. Only the first two are tracked externally; the third is session-internal by default.

| Level | What it is | Who creates it | Who executes it |
|---|---|---|---|
| **Epic** | Top-level vertical slice of the spec. "Add user authentication." Shippable increment. | Orchestrator's `decompose` phase | Decomposes into Stories |
| **Story** | One coherent implementation unit under an Epic. "Implement signup form + API endpoint." The unit a child session works. | Orchestrator's `sub_decompose` phase | One child session (kind=child) per Story |
| **Task** | A single TODO inside the child session's worktree. "Write the signup form tests." Mechanical, short-lived, per-iteration. | Plan agent inside the child session | Build agent in the same session |

**Epic and Story are tracker entities** — always, via the adapter. In GitHub, Epic is an issue and Story is a sub-issue. In the builtin adapter, Epic is a parent-level work item file and Story is a child-level file with `links.parent`. In future GitLab/Linear/etc. adapters, Epic and Story use the tracker's native hierarchy features.

**Tasks are session-internal.** They live in the daemon's task store (the `aloop-agent todo` system — see `pipeline.md` §Agent contract), survive worktree operations, and are routed between agents (plan → build, review → build, etc.) via `from`/`for` fields. Tasks are per-Story; each Story's child session has its own independent task list.

**Optional**: adapters can mirror tasks externally. See §Task tracking.

Why this split:

- Epic and Story are human-reviewable, long-lived, permission-scoped — they belong in the tracker humans already use.
- Tasks are generated and mutated dozens of times per Story. Syncing them to the tracker would produce noise (issue spam, webhook storms) and slow the loop. Keep them session-local by default.
- The daemon already has to track tasks for routing and completion detection — integrating that with the tracker is an optional convenience, not a requirement.

## Adapter interface

```ts
interface TrackerAdapter {
  readonly id: "github" | "gitlab" | "linear" | "builtin" | string;
  readonly capabilities: TrackerCapabilities;

  // Connection — called as part of the setup readiness gate (see setup.md §Verification)
  ping(): Promise<TrackerHealth>;

  // Work item queries
  listWorkItems(filter: WorkItemFilter): AsyncIterable<WorkItem>;
  getWorkItem(ref: WorkItemRef): Promise<WorkItem>;
  listComments(ref: WorkItemRef): AsyncIterable<Comment>;
  listLinkedChangeSets(ref: WorkItemRef): AsyncIterable<ChangeSetRef>;

  // Hierarchy
  getParent(ref: WorkItemRef): Promise<WorkItemRef | null>;
  listChildren(ref: WorkItemRef): AsyncIterable<WorkItem>;
  linkChild(parent: WorkItemRef, child: WorkItemRef, opts?: { replaceParent?: boolean }): Promise<void>;
  unlinkChild(parent: WorkItemRef, child: WorkItemRef): Promise<void>;
  reorderChild(parent: WorkItemRef, child: WorkItemRef, after?: WorkItemRef, before?: WorkItemRef): Promise<void>;
  childrenSummary(ref: WorkItemRef): Promise<{ total: number; completed: number }>;

  // Work item mutations
  createWorkItem(draft: WorkItemDraft): Promise<WorkItemRef>;
  updateWorkItem(ref: WorkItemRef, patch: WorkItemPatch): Promise<void>;
  addComment(ref: WorkItemRef, body: string): Promise<CommentRef>;
  addLabel(ref: WorkItemRef, label: string): Promise<void>;
  removeLabel(ref: WorkItemRef, label: string): Promise<void>;
  setAssignees(ref: WorkItemRef, assignees: string[]): Promise<void>;
  closeWorkItem(ref: WorkItemRef, reason?: "completed" | "not_planned"): Promise<void>;
  reopenWorkItem(ref: WorkItemRef): Promise<void>;

  // Change set (PR / MR / built-in branch) — optional capability
  createChangeSet?(draft: ChangeSetDraft): Promise<ChangeSetRef>;
  getChangeSet?(ref: ChangeSetRef): Promise<ChangeSet>;
  listChangeSets?(filter: ChangeSetFilter): AsyncIterable<ChangeSet>;
  addChangeSetComment?(ref: ChangeSetRef, body: string, position?: LinePosition): Promise<CommentRef>;
  resolveChangeSetThread?(ref: CommentRef): Promise<void>;
  updateChangeSetBranch?(ref: ChangeSetRef): Promise<void>;
  mergeChangeSet?(ref: ChangeSetRef, mode: MergeMode): Promise<MergeResult>;
  closeChangeSet?(ref: ChangeSetRef): Promise<void>;

  // Task mirroring — optional capability (see §Task tracking)
  mirrorTasks?(story: WorkItemRef, tasks: TaskSnapshot[]): Promise<void>;
  readMirroredTasks?(story: WorkItemRef): AsyncIterable<TaskSnapshot>;

  // Events — optional capability
  subscribe?(filter: TrackerEventFilter): AsyncGenerator<TrackerEvent>;
}
```

Capabilities declare what the adapter can do and how:

```ts
type TrackerCapabilities = {
  work_items:             true;
  labels:                 boolean;
  comments:               boolean;
  assignees:              boolean;
  change_sets:            boolean;
  change_set_reviews:     boolean;
  subscribe_events:       boolean;

  hierarchy: {
    native:               boolean;   // tracker has a first-class parent/child API
    max_depth:            number;    // 8 for GitHub sub-issues, N for others
    max_children_per_parent: number; // 100 for GitHub
    single_parent_only:   boolean;   // true for GitHub
    cross_repo_allowed:   boolean;   // false for GitHub (same-org only)
  };

  tracks_tasks: {
    mirror_supported:     boolean;   // adapter can mirror session tasks
    mirror_shape:         "checkboxes_in_body" | "sub_children" | "projects_board" | "none";
    max_tasks_per_story:  number | null;
  };

  milestones:             boolean;
  projects_boards:        boolean;
  max_body_bytes:         number;
};
```

## Generic data shapes

The central entity is **WorkItem** (not "Issue" — "issue" is tracker-specific vocabulary). A WorkItem's `kind` tells you what role it plays in the Epic/Story/Task hierarchy.

```ts
type WorkItemRef = {
  adapter: string;
  key: string;         // tracker-native id — GH "123", Linear "ABC-42", builtin "0007"
  url?: string;
};

type WorkItemKind = "epic" | "story" | "task_mirror" | "other";

type WorkItem = {
  ref: WorkItemRef;
  kind: WorkItemKind;
  title: string;
  body: string;
  state: "open" | "closed";
  status?: string;
  labels: string[];
  assignees: string[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  links: {
    parent?: WorkItemRef;
    children?: WorkItemRef[];
    blocks?: WorkItemRef[];
    blocked_by?: WorkItemRef[];
    change_sets?: ChangeSetRef[];
  };
  metadata: Record<string, unknown>;
};

type WorkItemDraft = {
  kind: WorkItemKind;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  parent?: WorkItemRef;     // for kind=story, the Epic's ref
  metadata?: Record<string, unknown>;
};

type WorkItemPatch = Partial<Pick<WorkItem, "title" | "body" | "state" | "status" | "labels" | "assignees">>;

type WorkItemFilter = {
  kind?: WorkItemKind | WorkItemKind[];
  state?: "open" | "closed";
  status?: string;
  labels?: string[];
  parent?: WorkItemRef;
  assignee?: string;
  wave?: number;
  limit?: number;
};

// ChangeSet, Review, ReviewThread, Comment — unchanged from v1 draft.
```

`kind` is aloop-level vocabulary; adapters map it to tracker-native semantics. For GitHub:

- `kind: epic` → plain issue, no parent.
- `kind: story` → plain issue with `parent` set, exposed via the sub-issue API on the Epic.
- `kind: task_mirror` → sub-issue of a Story (only when adapter mirrors tasks as sub-children).
- `kind: other` → any work item not created by aloop (pre-existing work, human-filed requests).

## Abstract status and label mapping

Trackers have different state machines. Aloop maps a small set of **abstract statuses** to each adapter's native states via config.

```yaml
# aloop/config.yml (per project)
tracker:
  adapter: github
  status_map:
    backlog:            { state: open, metadata: { refined: false, dor_validated: false } }
    needs_refinement:   { state: open, metadata: { refined: false } }
    refined:            { state: open, metadata: { refined: true, dor_validated: false } }
    dor_validated:      { state: open, metadata: { dor_validated: true } }
    in_progress:        { state: open, require_assignee: true }
    in_review:          { state: open, require_linked_change_set: true }
    done:               { state: closed, reason: completed }
    cancelled:          { state: closed, reason: not_planned }
  label_map:
    priority_critical:  aloop/priority-critical
    priority_high:      aloop/priority-high
    priority_low:       aloop/priority-low
    change_request:     aloop/change-request
    epic:               aloop/epic
    autodispatch:       aloop/auto
```

- **status_map** tells the adapter how to infer abstract status from tracker-native state + metadata, and how to set tracker-native state when transitioning.
- **label_map** insulates prompt templates from platform-specific label naming. Prompts say "priority_critical"; adapter writes `aloop/priority-critical`.
- The `epic` label is a fallback marker when the adapter lacks native hierarchy (GitLab, older Linear plans) — otherwise `kind` is enough.
- Orchestrator workflows use abstract names exclusively.

## Task tracking

**Default: tasks live in the daemon.** Every child session has its own task list in the daemon's task store, manipulated by `aloop-agent todo`. Task state is:

- Added by plan, review, spec-gap, or any agent with `todo add` permission.
- Completed by build, qa, or the agent whose role matches the task's `for`.
- Routed: `from` is creator role, `for` is intended executor.
- Survives worktree operations (task store is in session state dir, not worktree).
- Exposed by `aloop-agent todo list --format md` as a TODO.md-compatible rendering for agents that read/write it.

Tasks are NOT tracker entities by default. The pre-rebuild practice of parsing `TODO.md` markdown for completion detection is retired — completion is a structured API call.

**Opt-in: mirror tasks to the tracker.** When enabled, the adapter reflects the session's task list externally so stakeholders can watch task-level progress in their usual tracker UI. Default: off (tasks stay in the daemon). Three mirror shapes, pick one per project: Three mirror shapes:

| Shape | Where tasks appear | Trade-offs |
|---|---|---|
| `checkboxes_in_body` | A fenced section in the Story's work-item body | Cheap, atomic update, human-readable. Loses individual history. |
| `sub_children` | Each task is a sub-work-item of the Story | Rich history, per-task comments, respects `max_depth`. Noisy (count, webhooks). Not all trackers support it. |
| `projects_board` | Each task is a card on a project board linked to the Story | Clean separation, good for visualization. Board must exist; tasks lose repo-local context. |

Mirror policy per project:

```yaml
tracker:
  mirror_tasks:
    enabled: false                    # default off
    shape: checkboxes_in_body         # when enabled
    include_completed: false          # show only pending
    max_tasks: 50                     # hard cap to prevent runaway
```

| Shape | Where tasks appear | Trade-offs |
|---|---|---|
| `checkboxes_in_body` | A fenced section in the Story's work-item body | Cheap, atomic update, human-readable. Loses individual history. |
| `sub_children` | Each task is a sub-work-item of the Story | Rich history, per-task comments, respects `max_depth`. Noisy (count, webhooks). Not all trackers support it. |
| `projects_board` | Each task is a card on a project board linked to the Story | Clean separation, good for visualization. Board must exist; tasks lose repo-local context. |

Mirror policy per project:

```yaml
tracker:
  mirror_tasks:
    enabled: false                    # default off
    shape: checkboxes_in_body         # when enabled
    include_completed: false          # show only pending
    max_tasks: 50                     # hard cap to prevent runaway
```

The daemon pushes task-state changes to the adapter in batches (default: every 30s, or on session close) so it never blocks the child session; mirror failures log and do not halt work.

**When to enable mirroring:**

- Team projects where stakeholders watch progress in the tracker UI.
- Projects with long-running stories where task history matters.
- Compliance/audit contexts.

**When not to:**

- Solo or experimental work — noise outweighs benefit.
- High-frequency TDD loops — task churn produces tracker spam.
- Adapters whose available `mirror_shape` options all feel wrong for the project.

## Built-in adapter (no external deps)

For projects that don't want an external tracker — solo, air-gapped, or just avoiding vendor lock-in — the `builtin` adapter stores work items as files inside the project.

```
<project>/.aloop/tracker/
  0001-add-setup-skill.json              # Epic
  0002-scheduler-permit-protocol.json    # Epic
  0003-burn-rate-gate.json               # Story, parent: 0002
  0004-permit-persistence.json           # Story, parent: 0002
  changesets/
    0003-burn-rate-gate.json
  events.jsonl
```

Each work-item file:

```json
{
  "ref": { "adapter": "builtin", "key": "0003" },
  "kind": "story",
  "title": "Burn-rate gate",
  "body": "...",
  "state": "open",
  "status": "needs_refinement",
  "labels": ["aloop/priority-high"],
  "assignees": [],
  "links": {
    "parent": { "adapter": "builtin", "key": "0002" }
  },
  "metadata": { "refined": false, "dor_validated": false },
  "created_at": "...",
  "updated_at": "..."
}
```

### Properties

- Zero external deps. `git`, a filesystem, and aloop itself.
- Committed to the repo. Work-item state is versioned alongside code — reviewable, blame-able, revertable.
- Deterministic IDs (monotonic `NNNN`).
- `events.jsonl` is an append-only audit log — every mutation (create, label, assign, close) writes a line using the same envelope as the daemon event bus (`timestamp`, `kind`, payload) so tooling is reusable. Replays to any point in history.
- Change sets are branch-based: one branch per change set, merged via `git` under the daemon's policy.
- Native hierarchy: `links.parent`/`links.children` — `capabilities.hierarchy.native = true` (our own first-class support).
- Task mirroring: `sub_children` shape supported, but default off because the builtin's strength is simplicity.
- No real-time subscribe (or implemented via `fs.watch`).

### When to pick builtin

- Solo experiments, CLI prototypes, unpublished projects.
- Sensitive/air-gapped work where no tracker is acceptable.
- Reference environment for adapter tests — orchestrator can exercise the full decomposition flow against builtin in CI with no external services.

### Migration

Graduating a project from `builtin` to `github` (or any other tracker) is a future concern — a one-shot migration utility that walks the built-in store, creates matching items in the target tracker, and rewrites `aloop/config.yml`. The interface is deliberately unnamed here; when the need is real, we specify it.

## GitHub adapter (native sub-issues)

Primary shipped adapter. Uses GitHub's native sub-issue API (GA 2025-04-09) for the Epic → Story hierarchy. "Issue" is GitHub's name for the underlying entity — our adapter translates that to WorkItem in both directions.

### Hierarchy implementation

`capabilities.hierarchy`:

```
native:                  true
max_depth:               8
max_children_per_parent: 100
single_parent_only:      true       # GitHub enforces one parent per issue
cross_repo_allowed:      false      # same-org only (restricted in adapter for simplicity)
```

### API usage

- **Reads**: GraphQL. One round-trip for `parent`, `subIssues`, `subIssuesSummary`, plus any other issue fields we want. Fewer REST calls, lower rate-limit pressure.
  - Fields on `Issue`: `parent`, `subIssues(first/last/after/before)`, `subIssuesSummary { total, completed, percentCompleted }`.
- **Writes**: REST. Simpler payloads; integer IDs already in hand after creation.
  - `POST /repos/{owner}/{repo}/issues/{parent_number}/sub_issues` with `{ sub_issue_id, replace_parent? }`.
  - `DELETE /repos/{owner}/{repo}/issues/{parent_number}/sub_issue` (singular `/sub_issue` — watch the path) with `{ sub_issue_id }`.
  - `PATCH /repos/{owner}/{repo}/issues/{parent_number}/sub_issues/priority` with `{ sub_issue_id, after_id | before_id }`.
- **Mutations** (GraphQL) available but not preferred for normal writes: `addSubIssue`, `removeSubIssue`, `reprioritizeSubIssue`. `addSubIssue` uniquely accepts `subIssueUrl` — useful when composing cross-repo references before the local ID is known.

### Webhooks

Subscribe to the **`sub_issues`** event (not `issues` — GitHub does not fire `issues` for sub-issue changes). Actions: `sub_issue_added`, `sub_issue_removed`, `parent_issue_added`, `parent_issue_removed`. Payload carries `parent_issue_id`, `parent_issue`, `parent_issue_repo`, `sub_issue_id`, `sub_issue`.

The GitHub adapter consumes webhooks through `aloopd`'s public webhook endpoint (when configured). Without webhook configuration, the adapter polls `listChildren` on Epics with `polling.enabled: true`.

**Reconciliation window.** When webhooks are configured but may drop, a periodic poll (default: every hour) diffs the current tracker state against the last-seen snapshot. Missed changes are emitted as synthetic `tracker.event` entries with `source: "poll_reconcile"`. The reconciliation window is configurable per project; default 1h balances freshness against rate-limit pressure.

### Secondary rate limits

`POST /sub_issues` and `DELETE /sub_issue` carry explicit secondary rate-limit warnings. The adapter:

- Batches small operations when possible (multiple children added to an Epic in quick succession are queued and dispatched with backoff).
- Retries on 403 with `Retry-After` honored.
- Validates `max_depth` (8) and `max_children_per_parent` (100) client-side before POST to avoid 422s.

### `gh` CLI

`gh` has no native `sub-issue` command as of this writing, and `gh issue view --json` does NOT expose `parent` or `subIssues`. The adapter uses `gh api` (REST) and `gh api graphql` (GraphQL) directly. We do not depend on community extensions.

### Auth, scopes

- Classic PAT: `repo` scope.
- Fine-grained PAT or GitHub App: **Issues: read & write** on the repo.
- Adapter refuses to start without a working `gh auth status` or `GITHUB_TOKEN` env var; daemon surfaces the failure to the user.

### Policies

Same boundary as `security.md` §"Tracker adapter policy" — every tracker operation passes through a per-role allow-list (`review` role cannot call `createWorkItem`; `decompose` role cannot call `mergeChangeSet`; etc.). Policies are daemon-enforced, not adapter-enforced.

CR #192 (comment-driven PR lifecycle) and CR #134 (inline review) are adapter concerns: both use `addChangeSetComment` with `position` for line-specific threads and `resolveChangeSetThread` for thread closure.

## Orchestrator-facing contract (generic decomposition schema)

Orchestrator prompts produce tracker-agnostic structured output. The adapter layer translates into tracker-native operations.

### `decompose_result` (Epics)

```json
{
  "type": "decompose_result",
  "level": "epic",
  "items": [
    {
      "kind": "epic",
      "slug": "scheduler-and-permits",
      "title": "Scheduler and permit gateway",
      "body": "...",
      "labels": ["priority_critical"],
      "abstract_status": "needs_refinement",
      "dependencies": [],
      "metadata": { "spec_refs": ["docs/spec/daemon.md"] }
    }
  ]
}
```

### `sub_decompose_result` (Stories under an Epic)

```json
{
  "type": "sub_decompose_result",
  "level": "story",
  "parent": { "slug": "scheduler-and-permits" },
  "items": [
    {
      "kind": "story",
      "slug": "permit-protocol-design",
      "title": "Design scheduler permit protocol",
      "body": "...",
      "labels": ["priority_high"],
      "abstract_status": "needs_refinement",
      "dependencies": [],
      "wave": 1,
      "estimated_complexity": "M",
      "metadata": {
        "spec_refs": ["docs/spec/api.md#scheduler"],
        "environment_requirements": { "requires_vision": false }
      }
    }
  ]
}
```

### `refine_result`, `estimate_result`, `review_result`

Analogous abstract shapes. `slug` stays stable across refinements; `ref` (adapter, key) is assigned by the adapter after creation. Tasks are NOT in `decompose_result` / `sub_decompose_result` — they are generated inside the child session by the plan phase.

### Identity

- `slug` is the stable key the orchestrator uses before a work item exists in the tracker.
- After `adapter.createWorkItem` returns, the daemon stores `{slug → ref}` mapping.
- Subsequent orchestrator prompts reference items by `slug`; daemon resolves to `ref` when calling the adapter.

No tracker URLs, tracker-specific labels, `aloop/` prefixes, milestones, or `gh`-specific fields appear in orchestrator prompts or results.

## Events

The adapter normalizes tracker events into a single shape and publishes on the daemon bus:

```json
{
  "topic": "tracker.event",
  "data": {
    "adapter": "github",
    "project_id": "p_...",
    "kind": "change_set.review_submitted",
    "work_item": { "adapter": "github", "key": "287" },
    "change_set": { "adapter": "github", "key": "412" },
    "reviewer": "alice",
    "verdict": "changes_requested",
    "received_at": "..."
  }
}
```

Event kinds the orchestrator listens for:

- `work_item.created`, `work_item.updated`, `work_item.closed`, `work_item.reopened`
- `hierarchy.child_added`, `hierarchy.child_removed`, `hierarchy.parent_added`, `hierarchy.parent_removed`
- `comment.created`, `comment.updated` — **human comments are first-class orchestrator input** (see `orchestrator.md` §Epic/Story conversations). Adapter populates `data.source` as `"human"` for comments authored by users and `"aloop"` for comments authored by the orchestrator; the `user_comment` trigger in orchestrator workflows filters to `source=human` to avoid self-reaction loops.
- `change_set.opened`, `change_set.updated`, `change_set.closed`, `change_set.merged`, `change_set.conflict`
- `change_set.review_submitted`, `change_set.review_thread_resolved`

Adapters without subscribe capability can be polled by a daemon-side adapter-agnostic poller (interval configured per project). Events produced by polling carry `source: "poll"` in metadata.

## Configuration

Per-project in `aloop/config.yml`:

```yaml
tracker:
  adapter: github
  config:
    repo: owner/repo-name
    default_base_branch: master
    auth_method: gh-cli
    rate_limit:
      max_requests_per_minute: 60
    webhook:
      enabled: true
      secret_env: GITHUB_WEBHOOK_SECRET
  status_map: { ... }
  label_map:  { ... }
  polling:
    enabled: true
    interval: 60s
  mirror_tasks:
    enabled: false
    shape: checkboxes_in_body
```

Switch to builtin:

```yaml
tracker:
  adapter: builtin
  config:
    root: .aloop/tracker
```

Daemon validates on project registration; missing required fields fail loud.

## Multi-project

Each project has its own tracker configuration. The daemon holds N live adapters, one per project. Adapters are not shared across projects even if they point at the same remote tracker.

A session's `project_id` determines which adapter is used. There is no "global" tracker at the daemon level.

## Future adapters

Out of scope for v1, supported by the interface:

- **GitLab** — issues + merge requests + epics. `hierarchy.native: true` via GitLab epics (premium tier) or parent-link fallback.
- **Linear** — issues + projects + cycles. Uses Linear's parent/sub-issue hierarchy; `change_sets: false` (Linear model is branch-linked, not review-based in-product).
- **Gitea / Forgejo** — self-hosted, similar to GitHub but no native sub-issues yet (as of 2026) — falls back to parent-link metadata.
- **Jira** — issues + epics. Change sets via linked Bitbucket/GitHub (composite adapter possible).
- **Plain-text** — `.aloop/tracker/*.md` with YAML frontmatter; a thin variant of `builtin` for teams that want human-readable files under git.

Adding an adapter = implement the interface, declare capabilities, register with the daemon. No changes to orchestrator prompts or core daemon code.

## Invariants

1. **No agent ever calls a tracker API.** Adapters run daemon-side under policy.
2. **Orchestrator prompts are tracker-agnostic.** Generic data shapes only; `slug` identifiers across phases.
3. **The adapter is the only code that knows the tracker's names for things.** "Issue" is GitHub vocabulary; aloop says "work item."
4. **Status and label vocabulary come from project config.** Adding or renaming vocabulary is a config change, not a code change.
5. **GitHub is a shipped adapter, not a default assumption.** Removing the GH adapter from `aloop/config.yml` must not break the daemon, the loop, or the orchestrator — it shifts the project to whichever adapter is configured (or to builtin).
6. **The builtin adapter has feature parity with GH for the orchestrator's minimum viable flow** (decompose Epic → sub-decompose Stories → dispatch child sessions → review → merge → close).
7. **Epic and Story always live in the tracker.** Task tracking is session-internal by default; tracker mirroring is opt-in.
8. **Native hierarchy APIs are preferred over parent-link metadata** when the tracker offers them (GitHub sub-issues API is the canonical example).
