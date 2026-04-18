# Issue Tracker

> **Reference document.** The generic issue-tracking contract. GitHub is the first-class shipped adapter. The contract is tracker-agnostic; any project can swap adapters — or run with no external tracker at all using the built-in file-based store. Hard rules live in CONSTITUTION.md. Work items live in GitHub issues.
>
> Sources: CR #46 (agents must have zero knowledge of GitHub), CR #130 (investigator agent), CR #134 (inline PR review), CR #192 (comment-driven PR lifecycle), CR #169 (change request workflow), SPEC.md §`aloop gh` (moved to `security.md` as policy table), §Parallel Orchestrator decomposition.

## Table of contents

- Why an abstraction
- Trust boundary
- Adapter interface
- Generic data shapes
- Abstract status and label mapping
- Built-in adapter (no external deps)
- GitHub adapter
- Orchestrator-facing contract (generic decomposition schema)
- Events
- Configuration
- Multi-project
- Future adapters

---

## Why an abstraction

The orchestrator's job is to break a spec into tracked work items, dispatch loops against them, merge their changes, and react to review feedback. Those concepts exist in GitHub, GitLab, Linear, Jira, self-hosted Gitea, Forgejo, and inside any plain-text project that just wants a queue. Hardcoding GitHub forces aloop users into one platform; embedding `gh` CLI calls throughout the orchestrator makes the code brittle to upstream changes and impossible to use offline.

Aloop isolates the tracker behind a single `IssueTrackerAdapter` interface. Orchestrator prompts and workflows speak in terms of generic **issues** and **change sets** — the adapter translates to the tracker's native concepts (GitHub "issue" + "PR", GitLab "issue" + "MR", Linear "issue" + "Git branch link", built-in "issue" + "change set").

**The contract is:**

- One adapter per tracker.
- One active adapter per project (selectable in `aloop/config.yml`).
- All orchestrator interactions go through the adapter.
- Adapters are the only code that speaks tracker-native API.

## Trust boundary

Same boundary as all other aloop side effects. Agents do not call `gh`, `glab`, Linear API, or any tracker CLI. Agents **express intent** through `aloop-agent submit --type <decompose|refine|estimate|review|...>`; the daemon routes that intent to the active `IssueTrackerAdapter`, which executes the operation under a policy that the daemon enforces.

Restated:

- Agent → `aloop-agent submit` → daemon → adapter → tracker API
- Agent → *never directly* → tracker API

Policy enforcement (allow-list of operations, rate limiting, identity) lives in the daemon, not the adapter. Adapters are dumb executors of already-vetted commands.

## Adapter interface

```ts
interface IssueTrackerAdapter {
  readonly id: "github" | "gitlab" | "linear" | "builtin" | string;
  readonly capabilities: TrackerCapabilities;

  // Connection
  ping(): Promise<TrackerHealth>;

  // Issue queries
  listIssues(filter: IssueFilter): AsyncIterable<Issue>;
  getIssue(ref: IssueRef): Promise<Issue>;
  listComments(ref: IssueRef): AsyncIterable<Comment>;
  listLinkedChangeSets(ref: IssueRef): AsyncIterable<ChangeSetRef>;

  // Issue mutations
  createIssue(draft: IssueDraft): Promise<IssueRef>;
  updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void>;
  addComment(ref: IssueRef, body: string): Promise<CommentRef>;
  addLabel(ref: IssueRef, label: string): Promise<void>;
  removeLabel(ref: IssueRef, label: string): Promise<void>;
  setAssignees(ref: IssueRef, assignees: string[]): Promise<void>;
  closeIssue(ref: IssueRef, reason?: "completed" | "not_planned"): Promise<void>;
  reopenIssue(ref: IssueRef): Promise<void>;

  // Change set (PR / MR / built-in branch) — optional capability
  createChangeSet?(draft: ChangeSetDraft): Promise<ChangeSetRef>;
  getChangeSet?(ref: ChangeSetRef): Promise<ChangeSet>;
  listChangeSets?(filter: ChangeSetFilter): AsyncIterable<ChangeSet>;
  addChangeSetComment?(ref: ChangeSetRef, body: string, position?: LinePosition): Promise<CommentRef>;
  resolveChangeSetThread?(ref: CommentRef): Promise<void>;
  updateChangeSetBranch?(ref: ChangeSetRef): Promise<void>;   // rebase/merge base
  mergeChangeSet?(ref: ChangeSetRef, mode: MergeMode): Promise<MergeResult>;
  closeChangeSet?(ref: ChangeSetRef): Promise<void>;

  // Events — optional capability
  subscribe?(filter: TrackerEventFilter): AsyncGenerator<TrackerEvent>;
}
```

Capabilities are explicit so the orchestrator workflow can skip steps the adapter can't perform:

```ts
type TrackerCapabilities = {
  issues:              true;                     // always; adapter wouldn't exist without
  labels:              boolean;
  comments:            boolean;
  assignees:           boolean;
  change_sets:         boolean;                  // PR/MR/branch-based change review
  change_set_reviews:  boolean;                  // inline review comments, thread resolution
  subscribe_events:    boolean;                  // live event stream
  parent_child_links:  boolean;                  // issue A blocks/is-blocked-by B
  milestones:          boolean;
  projects_boards:     boolean;                  // board/project metadata
  max_body_bytes:      number;
};
```

## Generic data shapes

```ts
type IssueRef = {
  adapter: string;                 // "github" | "builtin" | ...
  key: string;                     // tracker-native id — GH: "123", Linear: "ABC-42", builtin: "0007"
  url?: string;                    // canonical link, if any
};

type Issue = {
  ref: IssueRef;
  title: string;
  body: string;
  state: "open" | "closed";        // canonical
  status?: string;                 // tracker-native status when richer than open/closed
  labels: string[];
  assignees: string[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  links: {
    parent?: IssueRef;
    blocks?: IssueRef[];
    blocked_by?: IssueRef[];
    change_sets?: ChangeSetRef[];
  };
  metadata: Record<string, unknown>;   // tracker-specific (milestone, projects, custom fields)
};

type IssueDraft = {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  parent?: IssueRef;
  metadata?: Record<string, unknown>;
};

type IssuePatch = Partial<Pick<Issue, "title" | "body" | "state" | "status" | "labels" | "assignees">>;

type ChangeSetRef = {
  adapter: string;
  key: string;                     // GH PR number, GL MR iid, builtin changeset id
  url?: string;
};

type ChangeSet = {
  ref: ChangeSetRef;
  issue?: IssueRef;
  title: string;
  body: string;
  state: "draft" | "open" | "merged" | "closed";
  head_branch: string;
  base_branch: string;
  head_sha: string;
  mergeable: "yes" | "no" | "unknown";
  mergeable_state: string;
  reviews: Review[];
  created_at: string;
  updated_at: string;
};

type Review = {
  reviewer: string;
  verdict: "approved" | "changes_requested" | "commented" | "dismissed";
  body: string;
  created_at: string;
  threads: ReviewThread[];
};

type ReviewThread = {
  id: string;
  path: string;
  line: number;
  resolved: boolean;
  comments: Comment[];
};
```

Generic comment / event shapes are analogous. See `api.md` for how these are surfaced to clients over SSE.

## Abstract status and label mapping

Trackers have different state machines. Aloop maps a small set of **abstract statuses** to each adapter's native states via config.

```yaml
# aloop/config.yml (per project)
issue_tracker:
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

- **status_map** tells the daemon how to infer abstract status from tracker-native state + metadata, and how to set tracker-native state when transitioning an abstract status.
- **label_map** insulates prompt templates from platform-specific label naming. Prompts say "priority_critical"; the adapter writes `aloop/priority-critical`.
- Orchestrator workflows use abstract names exclusively.

## Built-in adapter (no external deps)

For projects that don't want an external tracker — solo, air-gapped, or just avoiding vendor lock-in — the `builtin` adapter stores issues as files inside the project.

```
<project>/.aloop/issues/
  0001-add-setup-skill.json
  0002-scheduler-permit-protocol.json
  0003-burn-rate-gate.json
  changesets/
    0001-add-setup-skill.json
  events.jsonl                     # append-only audit log of all mutations
```

Each issue file:

```json
{
  "ref": { "adapter": "builtin", "key": "0001" },
  "title": "Add setup skill",
  "body": "...",
  "state": "open",
  "status": "needs_refinement",
  "labels": ["aloop/priority-high"],
  "assignees": [],
  "links": {
    "blocks": [{ "adapter": "builtin", "key": "0002" }]
  },
  "metadata": { "refined": false, "dor_validated": false },
  "created_at": "...",
  "updated_at": "..."
}
```

### Properties

- Zero external deps. `git`, a filesystem, and aloop itself.
- Committed to the repo. Issue state is versioned alongside code — reviewable, blame-able, revertable.
- Deterministic IDs (monotonic `NNNN`). No network collisions because there is no network.
- `events.jsonl` is an append-only audit log — every mutation (create, label, assign, close) writes a line. Replays to any point in history.
- Change sets in the built-in tracker are branch-based: one branch per change set, merged via `git` under the daemon's policy.
- No real-time subscribe support (or implemented as `fs.watch`). `capabilities.subscribe_events` reflects that.

### When to pick builtin

- Solo experiments, CLI prototypes, unpublished projects.
- Sensitive/air-gapped work where no tracker is acceptable.
- Reference environment for adapter tests — orchestrator can exercise the full decomposition flow against builtin in CI with no external services.

### Migration

`aloop issues migrate --from builtin --to github` (future) reads the built-in store, creates matching GitHub issues, and rewrites `aloop/config.yml`. Canonical way to "graduate" a project to a hosted tracker.

## GitHub adapter

Primary shipped adapter. Wraps the `gh` CLI and the GitHub GraphQL/REST APIs. Policies defined in `security.md` §"`aloop gh` policy table" apply — the adapter is the place those policies are enforced.

Notable mappings:

- `ChangeSet` ↔ GitHub PR
- `ReviewThread` ↔ GitHub review comment thread (GraphQL `PullRequestReviewThread`, resolve via `resolveReviewThread`)
- `Issue.metadata.milestone`, `Issue.metadata.projects` ↔ GH-specific
- `mergeChangeSet(mode: "squash" | "merge" | "rebase")` ↔ `gh pr merge --squash|--merge|--rebase`

Auth: `gh auth status`. Adapter refuses to run if `gh` is not logged in; daemon surfaces the error.

Rate limits: adapter caches GraphQL pagination keys, backs off on 429 with the same failure classification as the provider health FSM (see `provider-contract.md`). All GH calls carry a `requestor` identity — the daemon's audit log knows which session made which call.

CR #192 (comment-driven PR lifecycle) and CR #134 (inline review) are adapter concerns: both are implemented inside the GitHub adapter using `addChangeSetComment` with `position` and `resolveChangeSetThread`.

## Orchestrator-facing contract (generic decomposition schema)

Orchestrator prompts must produce tracker-agnostic structured output. The daemon's adapter layer converts them into tracker-native issues/change-sets.

### `decompose_result` (generic)

```json
{
  "type": "decompose_result",
  "issues": [
    {
      "slug": "scheduler-permit-protocol",
      "title": "Design scheduler permit protocol",
      "body": "...",
      "labels": ["priority_critical"],
      "abstract_status": "needs_refinement",
      "dependencies": [],
      "wave": 1,
      "estimated_complexity": "M",
      "metadata": {
        "spec_refs": ["docs/spec/daemon.md", "docs/spec/api.md"]
      }
    }
  ]
}
```

- `slug` is the stable key the orchestrator uses internally; the adapter may or may not surface it (GH: put in issue body footer; builtin: use as the id basis).
- `labels` are abstract names; resolved via `label_map`.
- `abstract_status` is resolved via `status_map`.
- `dependencies` are slugs referring to other issues in the same decompose result; the daemon links them via `parent_child_links` capability (if available) after creation.
- No GitHub URLs, labels with `aloop/` prefixes, milestones, or `gh`-specific fields appear in orchestrator prompts or results.

### `refine_result`, `estimate_result`, `review_result`

Analogous abstract shapes. See `pipeline.md` §Agent contract for the full list, and `agents.md` for each prompt's contract. Adapters map these to tracker-native operations (for GH: update issue body, add labels, post comments with metadata fences).

## Events

The adapter may subscribe to tracker events (issue opened, PR comment, review submitted, merge completed). Events are normalized to a single shape and published on the daemon bus:

```json
{
  "topic": "tracker.event",
  "data": {
    "adapter": "github",
    "project_id": "p_...",
    "kind": "change_set.review_submitted",
    "issue": { "adapter": "github", "key": "287" },
    "change_set": { "adapter": "github", "key": "412" },
    "reviewer": "alice",
    "verdict": "changes_requested",
    "received_at": "..."
  }
}
```

Orchestrator workflows subscribe to `tracker.event` with project filtering and queue prompts accordingly (PR review arrived → `triggers.pr_review_needed` → `PROMPT_orch_review.md`).

Adapters without subscribe capability can be polled by a daemon-side adapter-agnostic poller (interval configured per project). Events produced by polling carry `source: "poll"` in metadata.

## Configuration

Per-project in `aloop/config.yml`:

```yaml
issue_tracker:
  adapter: github
  config:
    repo: owner/repo-name
    default_base_branch: master
    auth_method: gh-cli              # or env:GITHUB_TOKEN
    rate_limit:
      max_requests_per_minute: 60
  status_map: { ... }                # as above
  label_map:  { ... }                # as above
  polling:
    enabled: true
    interval: 60s                    # for adapters without subscribe capability
```

Switch to builtin:

```yaml
issue_tracker:
  adapter: builtin
  config:
    root: .aloop/issues
```

Daemon validates the config on project registration — missing required fields fail loud.

## Multi-project

Each project has its own tracker configuration. The daemon holds N live adapters, one per project. Adapters are not shared across projects even if they point at the same remote tracker.

A session's `project_id` determines which adapter is used for its tracker operations. There is no "global" issue tracker at the daemon level.

## Future adapters

Out of scope for v1, supported by the interface:

- **GitLab** — issues + merge requests. Nearly 1:1 with GitHub.
- **Linear** — issues + connected branches + cycles. `change_sets: false`; PR-style review not part of the Linear model. Orchestrator workflows that require change set review would skip those phases.
- **Gitea / Forgejo** — self-hosted, similar to GitHub.
- **Jira** — issues only; change sets via linked Bitbucket/GitHub (mixed adapter via composition).
- **Plain-text** — `.aloop/issues/*.md` with YAML frontmatter; a thin variant of `builtin` for teams that want human-readable files under git.

Adding an adapter = implement the interface, declare capabilities, register with the daemon. No changes to orchestrator prompts or core daemon code.

---

## Invariants

1. **No agent ever calls a tracker API.** Adapters run daemon-side under policy.
2. **Orchestrator prompts are tracker-agnostic.** Structured outputs carry abstract statuses, abstract labels, and slug-based dependencies.
3. **The adapter is the only code that knows the tracker's names for things.**
4. **Status and label vocabulary come from project config.** Adding or renaming vocabulary is a config change, not a code change.
5. **GitHub is a shipped adapter, not a default assumption.** Removing the GH adapter from `aloop/config.yml` must not break the daemon, the loop, or the orchestrator — it shifts the project to whichever adapter is configured (or to builtin).
6. **The builtin adapter has feature parity with GH for the orchestrator's minimum viable flow** (decompose → refine → dispatch → review → close).
