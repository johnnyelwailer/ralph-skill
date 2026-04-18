# Orchestrator

> **Reference document.** Invariants and contracts consumed by agents at runtime. Work items live in GitHub issues; hard rules live in CONSTITUTION.md.
>
> Sources: SPEC.md §Parallel Orchestrator Mode, §State Machine, §Budget (lines ~1253-2236), SPEC-ADDENDUM.md §Synthetic Orchestrator Test, §Adapter Pattern, §Scan Agent Self-Healing, §Orchestrator Autonomy Fix, §Orchestrator PR Review, §Orchestrator Self-Healing, §Orchestrator Session Resumability (pre-decomposition, 2026-04-18).

## Table of contents

- Concept
- Shared loop mechanism
- Process diagram (daemon architecture)
- Child loop sub-spec
- UI variant exploration
- Multi-file specs
- Vertical slice decomposition
- Three-level hierarchy
- GitHub sub-issues
- GitHub as source of truth
- Dependency tracking
- Efficient GitHub monitoring
- Request/response protocol
- Autonomy levels
- Orchestrator state machine
- Refinement pipeline
- Dispatch
- Monitor + gate + merge
- Replan
- Agent/trunk branch
- Orchestrator local state
- Conflict resolution
- Provider budget awareness
- CLI / invocation
- Relationship to existing components
- Resumability
- Per-task environment requirements
- GitHub Enterprise support
- Adapter pattern
- Scan agent self-healing, diagnostics & alerting
- PR review: commit-aware, context-preserving
- Self-healing: failed issue recovery
- Synthetic orchestrator test scenario

---

## Concept

A meta-loop mode that decomposes a spec into **vertical slices** as GitHub issues with sub-issue hierarchy, launches independent child loops per sub-issue (each in its own worktree/branch), reviews the resulting PRs against hard proof criteria, and merges approved work into an agent-driven trunk branch. The human promotes agent/trunk to main when satisfied.

```
               SPEC.md (or specs/*.md)
                        │
                ┌───────┴───────┐
                │  ORCHESTRATOR  │  ← TS/Bun program (aloop/cli/)
                │   decompose    │     the brain
                └───────┬───────┘
                        │
             creates vertical slices
             as parent + sub-issues
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    Parent #10     Parent #20     Parent #30
   "User signup"  "Create posts" "Admin panel"
     │  │  │        │  │            │  │
    #11 #12 #13   #21 #22        #31 #32
     │   │   │     │   │          │   │
   loop loop loop loop loop    loop loop  ← loop scripts (inner loop)
     │   │   │     │   │          │   │     dumb workers
   PR#1 PR#2 ...  PR#4 PR#5    PR#6 PR#7
     └───┴───┴─────┴───┴────────┴───┘
                    │
            ┌───────┴───────┐
            │  ORCHESTRATOR  │
            │  gate + merge  │
            └───────┬───────┘
                    │
             agent/trunk branch
                    │
            (human promotes to main)
```

## Shared loop mechanism

The orchestrator and child implementation loops use the **same `loop.sh`/`loop.ps1`** — same `loop-plan.json`, same `queue/` folder, same frontmatter prompts. The difference is what prompts are in the cycle and queue.

**Orchestrator loop** — a `loop.sh` instance with orchestrator prompts:
- Cycle: single scan prompt as heartbeat (`PROMPT_orch_scan.md`)
- Primarily **queue-driven** — reactive, not cyclical. The scan checks state; the runtime generates per-item work prompts into `queue/`.
- Agents write `requests/*.json` for side effects (GitHub API calls, child loop launches). Runtime processes requests and queues follow-up prompts.
- Manages the full refinement pipeline: spec gap analysis → epic decomposition → epic refinement → sub-issue decomposition → sub-issue refinement → dispatch

**Child implementation loop** — a `loop.sh` instance with build prompts:
- Cycle: fixed rotation (plan → build → build → proof → qa → review)
- Primarily **cycle-driven** — proactive, predictable. Queue used only for steering/overrides.
- Reads its sub-spec from the issue body (seeded into its worktree), NOT the repo's SPEC.md
- Knows nothing about GitHub, other children, orchestration, or the full spec

**Aloop runtime** (TS/Bun, `aloop/cli/`) — the host-side process:
- Processes `requests/*.json` from both orchestrator and child loops
- Executes side effects: GitHub API, child loop spawning, PR operations
- Queues follow-up prompts into the requesting loop's `queue/` folder
- Monitors provider health, manages concurrency cap, budget
- Watches spec files for changes (git diff on spec glob)

```
Aloop Runtime (TS/Bun) ← host process, always running
  │
  ├── Orchestrator loop.sh instance
  │     ├── cycle: [PROMPT_orch_scan.md]  (heartbeat)
  │     ├── queue/: per-item work prompts  (reactive)
  │     ├── requests/: side effect requests → runtime
  │     └── scans GitHub state, refines issues, decides dispatch
  │
  ├── Child loop.sh (issue #11)
  │     ├── cycle: [plan, build×5, proof, qa, review]
  │     ├── queue/: steering overrides only
  │     └── reads sub-issue body as its spec
  │
  ├── Child loop.sh (issue #12)  ... same
  └── Child loop.sh (issue #13)  ... same
```

## Process diagram (daemon architecture)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER                                         │
│  aloop start / aloop orchestrate / aloop stop / aloop steer        │
└──────────┬──────────────────────────────────────┬───────────────────┘
           │ spawns                                │ spawns
           ▼                                       ▼
┌─────────────────────┐              ┌──────────────────────────────┐
│   DASHBOARD          │              │   LOOP.SH (any mode)         │
│   (Node.js server)   │              │   (orchestrator OR child)    │
│                      │              │                              │
│ • Pure observability │   reads      │ iteration loop:              │
│ • HTTP + SSE API     │◄────────────│  1. pick prompt (cycle/queue)│
│ • User steering UI   │  status.json │  2. invoke provider CLI      │
│ • No intelligence    │  log.jsonl   │  3. agent writes requests/   │
│                      │  active.json │  4. call process-requests    │
│ port 3000            │              │  5. advance position         │
└─────────────────────┘              │  6. goto 1                   │
                                      └──────┬───────────────────────┘
                                             │
                           step 4 calls      │
                           (orchestrate      │
                            mode only)       │
                                             ▼
                                ┌─────────────────────────────┐
                                │  aloop process-requests      │
                                │  (one-shot Node.js command)  │
                                │                              │
                                │  reads: requests/*.json      │
                                │         etag-cache.json      │
                                │  writes: queue/*.md           │
                                │          etag-cache.json     │
                                │                              │
                                │  actions:                    │
                                │  • create_issues → gh CLI    │
                                │  • dispatch_child → spawn    │
                                │    loop.sh (detached)        │
                                │  • merge_pr → gh CLI         │
                                │  • update_issue → gh CLI     │
                                │  • check child PIDs/status   │
                                │  • poll GitHub state         │
                                │  • queue follow-up prompts   │
                                │                              │
                                │  deletes processed requests  │
                                └──────┬──────────────────────┘
                                       │
                          dispatch_child │ spawns (detached)
                          requests       │
                     ┌───────────────────┼───────────────────┐
                     ▼                   ▼                   ▼
          ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
          │ CHILD LOOP 1     │ │ CHILD LOOP 2     │ │ CHILD LOOP 3     │
          │ (loop.sh)        │ │ (loop.sh)        │ │ (loop.sh)        │
          │                  │ │                  │ │                  │
          │ own worktree     │ │ own worktree     │ │ own worktree     │
          │ own branch       │ │ own branch       │ │ own branch       │
          │ own session dir  │ │ own session dir  │ │ own session dir  │
          │ own loop-plan    │ │ own loop-plan    │ │ own loop-plan    │
          │                  │ │                  │ │                  │
          │ cycle:           │ │ cycle:           │ │ cycle:           │
          │  plan→build→     │ │  plan→build→     │ │  plan→build→     │
          │  qa→review       │ │  qa→review       │ │  qa→review       │
          │                  │ │                  │ │                  │
          │ self-contained   │ │ self-contained   │ │ self-contained   │
          │ no coordinator   │ │ no coordinator   │ │ no coordinator   │
          │ needed           │ │ needed           │ │ needed           │
          └──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Key properties:**
- **Dashboard** is fully independent — reads files, serves UI. Works with any session type.
- **Orchestrator loop** is a regular `loop.sh` with `PROMPT_orch_scan.md` as cycle + `process-requests` called between iterations. Serial by design.
- **Child loops** are fully self-contained `loop.sh` instances. No coordinator needed.
- **`process-requests`** is the only new command. One-shot, stateless (except `etag-cache.json`), called by the orchestrator loop between iterations.
- **Fan-out** happens when `process-requests` handles `dispatch_child` — it spawns detached `loop.sh` processes and returns.

`aloop orchestrate` must follow the same lifecycle as `aloop start`:

1. **Initialize** — create session dir, compile prompts, write `orchestrator.json`
2. **Register** — add entry to `active.json` with PID, session_dir, work_dir
3. **Spawn background daemon** — detached process running the orchestrator scan loop
4. **Return immediately** — print session info, exit CLI
5. **Daemon runs until done** — scan loop runs indefinitely until all issues complete, user stops it, or budget exhausted

**ETag cache persistence:** The `EtagCache` (used for conditional GitHub API requests to avoid rate limits) must be persisted to `etag-cache.json` in the session dir. `process-requests` loads it on startup, writes it back after processing. This preserves rate-limit efficiency across invocations without requiring a long-running process.

## Child loop sub-spec

Each child loop does NOT read the repo's SPEC.md. The orchestrator extracts a **self-contained sub-spec** from the parent spec during decomposition and writes it into the sub-issue body. The child loop's plan agent reads this as its entire world:

```
Orchestrator reads:  specs/auth.md (full vertical slice spec)
                          │
                    decomposes into
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         Issue #11    Issue #12    Issue #13
      "Registration"  "Login"    "Password reset"
      (sub-spec in    (sub-spec   (sub-spec in
       issue body)    in body)     issue body)
              │           │           │
         child loop   child loop  child loop
         reads #11    reads #12   reads #13
         as its spec  as its spec as its spec
```

The sub-spec in the issue body contains:
- Scope description — what this work unit delivers
- Acceptance criteria — how to know it's done
- Context — relevant architecture decisions from the parent spec
- Boundaries — what NOT to touch (other slices' territory)

This scoping is critical — the child loop shouldn't make system-wide decisions. It delivers its slice and nothing more.

**Sub-spec handling:** Child loops receive their task specification as `TASK_SPEC.md` (NOT `SPEC.md`). The project's `SPEC.md` must never be overwritten by a child loop. `TASK_SPEC.md` is gitignored and excluded from PRs.

## UI variant exploration

When `ui_variant_exploration` is enabled in the session's `meta.json`, and an epic involves user-facing UI features, the decompose agent should plan **multiple distinct UI variants** for the same feature — each built by a separate child loop with different design direction in its sub-spec instructions.

**How it works:**

1. **Decompose agent** identifies sub-issues that involve UI work (components, pages, layouts, interactions)
2. For qualifying features, creates 2-3 sibling sub-issues instead of one, each with a different design focus:
   - Variant A: "minimal / data-dense / power-user focused"
   - Variant B: "visual / spacious / guided UX"
   - Variant C: "progressive disclosure / mobile-first" (if 3 variants)
3. Each variant sub-issue gets a distinct sub-spec that emphasizes different trade-offs
4. All variants are **togglable via runtime feature flags** — a simple env var or config toggle, not compile-time branching. All variants ship in the same build.
5. The parent issue tracks which variants were produced and links to their PRs
6. User reviews the variants (side-by-side if dashboard supports it) and picks one — or combines elements from multiple

**Feature flag convention:**
```
FEATURE_<epic>_VARIANT=A|B|C   (env var)
```
Or in a shared config file the app reads at startup. The flag defaults to variant A. All variants share the same data layer / API — only the presentation differs.

**When this activates:**
- `ui_variant_exploration: true` in `meta.json` AND the feature involves UI components
- The decompose agent decides how many variants (2-3) based on available parallelism budget

**When this does NOT activate:**
- `ui_variant_exploration: false` (or not set) — default is disabled
- Backend-only features, API-only, infrastructure, data pipelines

## Multi-file specs

Single `SPEC.md` breaks down at scale. The orchestrator supports multiple spec files:

```
specs/
  SPEC.md              ← master spec (architecture, constraints, non-goals)
  auth.md              ← vertical slice group
  posts.md             ← vertical slice group
  admin.md             ← vertical slice group
```

The master spec defines the system — architecture, constraints, non-goals. Each additional spec file defines a group of related vertical slices. The orchestrator reads all spec files and produces the full issue set.

Single `SPEC.md` still works — multi-file is optional for larger projects.

## Vertical slice decomposition

The orchestrator decomposes the spec into **vertical slices** — independently shippable, end-to-end user-facing features that cut through the full stack.

**Correct decomposition** (vertical):
```
Parent #10: "User can sign up and log in"
  Sub-issue #11: "Registration form + API endpoint + DB schema + validation"
  Sub-issue #12: "Login flow + JWT issuance + session cookie"
  Sub-issue #13: "Password reset email flow end-to-end"
```

**Wrong decomposition** (horizontal layers):
```
❌ Parent: "Database models"           ← all models, no user-facing outcome
❌ Parent: "API endpoints"             ← all APIs, no shippable feature
❌ Parent: "Frontend components"       ← all UI, can't run independently
```

Sub-issues should also be vertical where possible — each one delivers a runnable piece of the parent feature. Sometimes horizontal groundwork is unavoidable (e.g., "Set up database schema and ORM config" before any feature can use it). These are explicitly marked as **foundation** issues with dependencies.

## Three-level hierarchy

| Level | GitHub entity | What it represents | Who creates it |
|-------|-------|---------|---|
| Spec | `SPEC.md` / `specs/*.md` | Intent — what & why | Human |
| Slice | Parent issue | Vertical slice — independently shippable feature | Orchestrator (decompose agent) |
| Work unit | Sub-issue | Scoped piece of a slice — gets its own child loop | Orchestrator (decompose agent) |
| Task | Child's `TODO.md` | Implementation steps within a work unit | Child loop's plan agent |

The spec is the authoritative intent. Parent issues are vertical slices derived from the spec. Sub-issues are scoped work units within each slice. Tasks are ephemeral implementation steps that live and die within a child loop.

## GitHub sub-issues

Sub-issues are GA (since March 2025), available on all GitHub plans. Limits: 100 sub-issues per parent, 8 levels deep, cross-repo within org.

**Creation via `gh api`** (no native `gh issue create --parent` yet):

```bash
# Create parent (vertical slice)
PARENT=$(gh api --method POST /repos/OWNER/REPO/issues \
  -f title="User can sign up and log in" \
  -f body="$(cat slice-body.md)" \
  --jq '.number')

# Create sub-issue (work unit)
CHILD_RESULT=$(gh api --method POST /repos/OWNER/REPO/issues \
  -f title="Registration form + API + DB schema" \
  -f body="$(cat workunit-body.md)")
CHILD_ID=$(echo "$CHILD_RESULT" | jq -r '.id')

# Link as sub-issue (uses parent NUMBER but child internal ID)
gh api --method POST /repos/OWNER/REPO/issues/$PARENT/sub_issues \
  -f sub_issue_id="$CHILD_ID"
```

**Gotchas**: The `sub_issue_id` requires the internal numeric `id` (not the `#number`). Occasional 500s on the sub-issues endpoint — retry logic needed. No atomic create-with-children — must create then link.

## GitHub as source of truth

**GitHub is the authoritative state for the orchestrator.** There is no local `orchestrator.json` that duplicates issue state. The orchestrator queries GitHub for the plan, and all changes — human or automated — are visible immediately.

Local state is minimal: `sessions.json` maps `{issue_number → child_session_id + PID}`. Everything else — issue status, dependencies, wave assignments, PR state — lives in GitHub.

Benefits:
- Human edits an issue (close, reopen, relabel) → orchestrator sees it next poll
- Orchestrator crashes and restarts → reads everything from GitHub, local mapping reconnects running children
- Multiple people can interact with the issues → single source of truth
- `--plan-only` just creates issues, done

## Dependency tracking

Dependencies use **GitHub's native issue dependency tracking** (`blocked_by` / `blocking` relationships), not custom metadata. The orchestrator creates dependencies via the API, and GitHub surfaces them natively in the issue UI.

**Issue body format:**
```markdown
## Scope
Registration form with email/password, API endpoint for account creation,
database schema for users table. Includes input validation and error handling.

## Acceptance Criteria
- [ ] User can fill out registration form and submit
- [ ] API validates input and creates user record
- [ ] Duplicate email returns clear error
- [ ] Success redirects to login page

## Aloop Metadata
- Wave: 2
- Files: `src/pages/register/*`, `src/api/auth/*`, `prisma/schema.prisma`
- Type: vertical-slice
```

Dependencies are managed via GitHub's native feature, not embedded in the issue body. Wave assignment and file ownership hints live in the issue body as human-readable metadata. Labels (`aloop/wave-2`, `aloop/auto`, `aloop/foundation`) provide machine-queryable categorization.

## Efficient GitHub monitoring

The orchestrator avoids expensive polling by combining ETag-guarded REST checks with targeted GraphQL queries.

**Strategy:**

1. **Change detection** (every 30-60s): REST call with `since` parameter and ETag caching
   ```bash
   gh api '/repos/OWNER/REPO/issues?sort=updated&since=LAST_CHECK&per_page=1' \
     -H 'If-None-Match: PREVIOUS_ETAG'
   ```
   Returns `304 Not Modified` when nothing changed — does NOT count against rate limit.

2. **Full state fetch** (only when changes detected): Single GraphQL query fetching all open issues + sub-issues + linked PRs + labels + dependency status
   ```graphql
   query {
     repository(owner: "OWNER", name: "REPO") {
       issues(first: 50, states: OPEN, labels: ["aloop/auto"], orderBy: {field: UPDATED_AT, direction: DESC}) {
         nodes {
           number, title, state, updatedAt
           labels(first: 10) { nodes { name } }
           subIssues(first: 20) {
             nodes { number, title, state, labels(first: 5) { nodes { name } } }
           }
           timelineItems(first: 5, itemTypes: [CROSS_REFERENCED_EVENT]) {
             nodes { ... on CrossReferencedEvent { source { ... on PullRequest { number, state, url } } } }
           }
         }
       }
     }
   }
   ```
   Cost: **~7 rate-limit points** per query. At 5,000/hr, this can run 714 times/hour.

3. **Optional: webhook push** (for instant event notification during active sessions):
   ```bash
   gh webhook forward --repo=OWNER/REPO --events=issues,pull_request --url=http://localhost:PORT/webhook
   ```
   Uses GitHub's own CLI extension (`gh extension install cli/gh-webhook`). No public server needed. Falls back to polling when not running.

**Rate limit budget** (60s polling interval, 50 issues):
- REST change-detection with ETag: ~5-10 counted requests/hr (most are free 304s)
- GraphQL full fetch (only on change): ~5-20 queries/hr = 35-140 points/hr
- **Total: well under 1% of rate limit**

## Request/response protocol

Agents inside `loop.sh` cannot call external APIs directly (inner loop boundary). When an agent needs a side effect (create GitHub issue, launch child loop, merge PR), it writes a **request file** with a predefined structured contract. The runtime processes it and queues follow-up prompts.

**Direction:**
- `$SESSION_DIR/requests/*.json` — agent → runtime (structured side-effect requests)
- `$SESSION_DIR/queue/*.md` — runtime → loop (follow-up prompts with results baked in)

**Request file contract:**

Every request file follows the same envelope:
```json
{
  "id": "req-<monotonic-counter>",
  "type": "<request_type>",
  "payload": { ... }
}
```

**Defined request types:**

All markdown content (issue bodies, PR descriptions, comments, sub-specs) is passed as **file path references** to `.md` files in the session directory — never inline in the JSON. The agent writes the markdown file, then references its path in the request payload.

| Type | Payload | Runtime action | Queues |
|------|---------|----------------|--------|
| `create_issues` | `{issues: [{title, body_file, labels, parent?}]}` | Creates GitHub issues (reads body from file), links sub-issues to parent | Per-issue refinement prompts |
| `update_issue` | `{number, body_file?, labels_add?, labels_remove?, state?}` | Updates issue on GitHub (reads body from file if provided) | None (or re-analysis prompt if body changed) |
| `close_issue` | `{number, reason}` | Closes issue with comment | None |
| `create_pr` | `{head, base, title, body_file, issue_number}` | Creates PR via `gh pr create` (reads description from file), links to issue | Gate/review prompt |
| `merge_pr` | `{number, strategy: "squash"\|"merge"\|"rebase"}` | Merges PR via `gh pr merge` | Downstream dispatch prompts |
| `dispatch_child` | `{issue_number, branch, pipeline, sub_spec_file}` | Creates worktree, compiles child `loop-plan.json`, seeds sub-spec from file, launches child `loop.sh` | Monitor prompt |
| `steer_child` | `{issue_number, prompt_file}` | Copies prompt file to child's `queue/` | None |
| `stop_child` | `{issue_number, reason}` | Sends SIGTERM to child loop PID | Cleanup prompt |
| `post_comment` | `{issue_number, body_file}` | Posts comment on GitHub issue/PR (reads from file) | None |
| `query_issues` | `{labels?, state?, since?}` | Queries GitHub issues, writes result to queue as context | Analysis prompt with results |
| `spec_backfill` | `{file, section, content_file}` | Reads content from file, writes into spec file at section, commits | None |

**Payload validation:** The runtime validates each request against the contract before processing. Malformed requests are moved to `$SESSION_DIR/requests/failed/` with an error annotation. The loop picks up the failure on next scan.

**Idempotency:** Every request type is designed to be safe to re-execute. `create_issues` checks for existing issues by title+label match. `merge_pr` checks if already merged. `dispatch_child` checks if session already exists. This ensures resumability after crashes.

**Request file naming:** `req-<NNN>-<type>.json` (e.g., `req-001-create_issues.json`). Counter is monotonic per session. Runtime processes in order.

**Loop script addition** — wait for pending requests before next iteration:
```bash
REQUESTS_DIR="$SESSION_DIR/requests"
if ls "$REQUESTS_DIR"/*.json 2>/dev/null | grep -q .; then
    write_log_entry "waiting_for_requests" "count" "$(ls "$REQUESTS_DIR"/*.json | wc -l)"
    WAIT_START=$(date +%s)
    TIMEOUT=${REQUEST_TIMEOUT:-300}
    while ls "$REQUESTS_DIR"/*.json 2>/dev/null | grep -q .; do
        sleep 2
        ELAPSED=$(( $(date +%s) - WAIT_START ))
        if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
            write_log_entry "request_timeout" "elapsed" "$ELAPSED"
            break
        fi
    done
fi
```

Request files are deleted by the runtime after processing. The loop waits for the directory to empty, then picks up whatever the runtime queued.

**Prompt content rule:** Orchestrator prompts (decompose, gap analysis, estimation, sub-decompose, etc.) must **never embed file contents** in the prompt body. Reference files by path and let the agent read them from the worktree. Queue prompts must only contain: task instructions (the agent prompt template), file paths to read, the output path for results, and contextual metadata (issue numbers, titles, wave info — small structured data). No queue prompt file should exceed 10KB (excluding frontmatter).

## Autonomy levels

Gap resolution behavior is configurable per session, set during `aloop setup`:

| Level | Behavior | When to use |
|-------|----------|-------------|
| `cautious` | All questions block, wait for user to answer | High-stakes, unfamiliar domain, vague spec |
| `balanced` | Low-risk questions auto-resolved, high-risk block for user | Default — good spec with some gaps |
| `autonomous` | All questions auto-resolved, only true contradictions block | High-quality spec, trusted agent judgment |

**Two-agent model:** Gap analysis always creates `aloop/spec-question` issues — regardless of autonomy level. This ensures every gap is recorded. A separate **resolver agent** (`PROMPT_orch_resolver.md`) then runs and, based on the autonomy level, either:
- **Waits** — leaves the issue open and blocking (cautious mode, or high-risk in balanced mode)
- **Resolves** — comments on the issue with its reasoning and chosen approach, updates the spec with the decision, closes the issue to unblock downstream work

This means:
1. Every question is visible on GitHub — the user always sees what was asked
2. Every autonomous decision has a documented rationale in the issue comments
3. The user can reopen any auto-resolved issue to override the decision
4. The same issue thread serves as the conversation — whether human or agent answered
5. `aloop/spec-question` label means "unresolved"; closing means "resolved" (by human or agent)

**Resolver agent behavior by autonomy level:**

| Autonomy | Low-risk gap | Medium-risk gap | High-risk gap |
|----------|-------------|-----------------|---------------|
| `cautious` | Wait for user | Wait for user | Wait for user |
| `balanced` | Auto-resolve + comment | Wait for user | Wait for user |
| `autonomous` | Auto-resolve + comment | Auto-resolve + comment | Auto-resolve + comment |

Risk classification:
- **Low-risk**: naming conventions, error message wording, UI spacing, log levels, file organization
- **Medium-risk**: API contract details, data model choices, auth flow specifics, error handling strategy
- **High-risk**: architectural boundaries, security model, data privacy, billing logic, breaking changes

## Orchestrator state machine

The orchestrator is **reactive and queue-driven**. Instead of numbered phases, each issue progresses through a **GitHub-native state model** (issue state + Project status field), with labels used only when no native signal can represent the state. The orchestrator scan agent checks state each iteration and the runtime queues work for items ready for their next step.

```
┌──────────────────────────────────────────────────────────────────┐
│                    ISSUE STATE MACHINE                            │
│                                                                  │
│  Spec file(s)                                                    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐     ┌──────────────────┐                    │
│  │  GLOBAL SPEC     │────▶│  EPIC DECOMPOSE   │                   │
│  │  GAP ANALYSIS    │     │                  │                    │
│  │  (product +      │     │  Spec → vertical │                    │
│  │   architecture)  │     │  slice epics     │                    │
│  └─────────────────┘     └────────┬─────────┘                    │
│          ▲ re-trigger              │                              │
│          │ on spec change          │ per epic:                    │
│          │                         ▼                              │
│  ┌───────┴──────┐        ┌──────────────────┐                    │
│  │ SPEC CHANGED  │        │  EPIC REFINEMENT  │                   │
│  │ (git diff     │        │                  │                    │
│  │  watcher)     │        │  Product analyst │                    │
│  └──────────────┘        │  Arch analyst    │                    │
│                           │  Cross-epic deps │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    ▼                              │
│                           ┌──────────────────┐                    │
│                           │  SUB-ISSUE        │                   │
│                           │  DECOMPOSITION    │                   │
│                           │                  │                    │
│                           │  Epic → scoped   │                    │
│                           │  work units      │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    │ per sub-issue:               │
│                                    ▼                              │
│                           ┌──────────────────┐                    │
│                           │  SUB-ISSUE        │                   │
│                           │  REFINEMENT       │                   │
│                           │                  │                    │
│                           │  Specialist plan │                    │
│                           │  (FE/BE/infra)   │                    │
│                           │  Estimation      │                    │
│                           │  DoR check       │                    │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    │ Definition of Ready passes   │
│                                    ▼                              │
│                           ┌──────────────────┐                    │
│                           │  READY            │──── dispatch ────▶│
│                           └──────────────────┘    child loop.sh  │
│                                                        │         │
│                                                        ▼         │
│                           ┌──────────────────┐  ┌────────────┐   │
│                           │  INTEGRATION      │◀─│ CHILD DONE │   │
│                           │  Gate + Merge     │  └────────────┘   │
│                           └────────┬─────────┘                    │
│                                    │                              │
│                                    ▼                              │
│                              agent/trunk                          │
└──────────────────────────────────────────────────────────────────┘
```

**GitHub-native state transitions (status-first):**

| GitHub signal | Meaning | What happens next |
|--------------|---------|-------------------|
| Label `aloop` + Project status `Needs analysis` | Spec or epic needs gap analysis | Product + arch analyst agents run |
| Label `aloop/spec-question` | Blocking question for user | Waits for user response (or auto-resolves based on autonomy level) |
| Label `aloop/auto-resolved` | Spec question resolved by agent (not human) | User can reopen to override |
| Label `aloop` + Project status `Needs decomposition` | Ready for decomposition into sub-items | Decompose agent runs |
| Label `aloop` + Project status `Needs refinement` | Needs specialist planning | Specialist planner + estimation agents run |
| Label `aloop` + Project status `Ready` | Definition of Ready passed | Eligible for dispatch to child loop |
| Label `aloop` + Project status `In progress` | Child loop running | Monitor watches status |
| Label `aloop` + Project status `In review` | PR created, gates running | Gate + merge process |
| Label `aloop` + Project status `Done` or issue `state=closed` | Merged to agent/trunk | Complete |
| Label `aloop` + Project status `Blocked` | Waiting on dependency or question | Unblocks when dependency merges or question resolves |

The orchestrator MUST prefer native GitHub status signals over workflow labels for progression. If a repository has no compatible Project status field, it MAY use legacy `aloop/*` progression labels as a fallback compatibility mode.

## Refinement pipeline

### Global spec analysis

Before any decomposition, specialist agents review the spec for issues that would waste build iterations downstream. Two perspectives run in sequence:

**Product Analyst Agent** (`PROMPT_orch_product_analyst.md`):
- Missing user stories / personas
- Unclear acceptance criteria — "should handle errors gracefully" (how?)
- Scope gaps — features referenced but never defined
- Conflicting requirements between sections

**Architecture Analyst Agent** (`PROMPT_orch_arch_analyst.md`):
- Infeasible constraints — requirements that conflict with stated constraints
- Unstated technical dependencies — "uses the database" (which one?)
- Missing system boundaries and integration points
- Scale/performance assumptions that need quantifying

Each gap becomes a focused `aloop/spec-question` issue — interview style, one question per issue, with context on why it matters and suggested resolution options. Blocking behavior depends on the configured autonomy level.

**Re-triggering:** When the spec watcher detects changes (git diff on spec glob), analysis re-runs on changed sections only. New questions block affected items, not the entire pipeline.

### Epic decomposition

The decompose agent reads the spec(s) and current codebase, then produces the top-level issue hierarchy.

1. Read all spec files and codebase state
2. Produce **vertical slices** as parent (epic) issues — each independently shippable, end-to-end
3. High-level scope + acceptance criteria per epic
4. Dependency hints between epics
5. Include "Set up GitHub Actions CI" as an early foundation task when no CI exists. Build agents should be able to create/modify `.github/workflows/*.yml` files. The GH Actions setup should be treated as a technical build task, not a manual prerequisite.
6. Write `requests/create-epics.json` → runtime creates GitHub issues
7. Runtime queues per-epic refinement prompts into `queue/`

Labels: `aloop/epic`, `aloop/needs-refine`, `aloop/wave-N`

### Epic refinement (per epic)

Each epic gets two specialist passes before being decomposed further:

**Product Analyst** (per epic):
- Edge cases and error flows
- User journey completeness
- Acceptance criteria sharpening — each criterion must be objectively testable

**Architecture Analyst** (per epic):
- API contracts and data models
- Integration points with other epics
- Shared infrastructure needs
- Migration / backwards-compatibility concerns

**Cross-Epic Dependency Analyst:**
- Interfaces between epics — where two epics assume conflicting designs
- Shared types, DB schema, API contracts that must be agreed before either builds
- Flags conflicting assumptions as `aloop/spec-question`

Creates `aloop/spec-question` issues if gaps found (blocks THIS epic only). Updates epic issue body with refined requirements. Labels epic `aloop/needs-decompose` when done.

### Sub-issue decomposition (per epic)

The decompose agent breaks each refined epic into scoped work units:

1. Each sub-issue sized for ~1-3 hours of human work equivalent (~5-15 build iterations)
2. Scoped: clear input → clear output
3. File ownership hints (prevents parallel edit conflicts)
4. Dependency ordering within and across epics
5. Write `requests/create-sub-issues.json` → runtime creates and links to parent
6. Runtime queues per-sub-issue refinement prompts

Labels: `aloop/sub-issue`, `aloop/needs-refine`

### Sub-issue refinement (per sub-issue)

Each sub-issue gets specialist planning based on its type:

**Specialist Planner** (one of, based on sub-issue content):
- `PROMPT_orch_planner_frontend.md` — component structure, state management, UI flow, routing
- `PROMPT_orch_planner_backend.md` — API endpoints, data access, business logic, validation
- `PROMPT_orch_planner_infra.md` — deployment, configuration, migrations, CI/CD
- `PROMPT_orch_planner_fullstack.md` — when sub-issue spans both layers

**Estimation Agent** (`PROMPT_orch_estimate.md`):
- Complexity score (S / M / L / XL)
- Estimated iteration count for child loop
- Risk flags (novel tech, unclear requirements, high coupling)

**Definition of Ready (DoR) Check:**

| Criterion | Description |
|-----------|-------------|
| Acceptance criteria | Specific and objectively testable — not vague |
| No open questions | No unresolved `aloop/spec-question` linked to this sub-issue |
| Dependencies resolved | All dependencies either merged or scheduled in an earlier wave |
| Implementation approach | Specialist planner has outlined the approach |
| Estimation complete | Complexity scored and iteration count estimated |
| Interface contracts | Inputs consumed and outputs produced are specified |

If DoR fails → creates `aloop/spec-question` issues for the gaps, blocks THIS sub-issue only.
If DoR passes → sets Project status to `Ready` (and keeps the single tracking label `aloop`).

**Re-estimation:** The estimation agent runs again after specialist planning, since complexity often changes once the approach is defined.

**Refinement budget cap:** Max N analysis iterations per item (configurable, default 5) before forcing a decision. Prevents infinite question loops — after the cap, remaining ambiguities are resolved at the configured autonomy level regardless.

## Dispatch

The orchestrator scan agent identifies `Ready` sub-issues (Project status) and writes dispatch requests.

1. Query sub-issues with Project status `Ready` whose dependencies are all merged
2. Respect **concurrency cap** (configurable, default 3) and **wave scheduling**:
   - Sub-issues in the same wave MAY run in parallel
   - Wave N+1 sub-issues dispatch only after their specific dependencies merge (not all of wave N)
   - File ownership hints prevent parallel edits to the same files
3. Write `requests/dispatch.json` → runtime:
   - Creates branch: `aloop/issue-<number>`
   - Creates worktree
   - Seeds child's working directory with sub-spec from issue body
   - Compiles child's `loop-plan.json` with implementation cycle (plan-build-proof-qa-review)
   - Launches child `loop.sh` instance
   - Sets Project status to `In progress`
4. Remaining issues queue until a slot opens or dependencies merge

## Monitor + gate + merge

The orchestrator scan agent checks child loop statuses and PR states each iteration:

**Child monitoring:**
- Read each child's `status.json` for state (running, completed, failed, limit_reached)
- Failed or stalled children → write steering to child's `queue/`, reassign provider, or kill and retry
- Completed children → write `requests/create-pr.json` → runtime creates PR targeting `agent/trunk`
- Failed children → log, optionally retry with different provider mix or re-decompose

**PR gates (automated, must all pass):**

| Gate | Method | Fail action |
|------|--------|-------------|
| GitHub Actions CI | `gh pr checks --watch` | Block merge, extract failure logs via `gh run view --log-failed` |
| Test coverage | Parse coverage from CI artifacts or GH Actions output | Block if below threshold |
| No merge conflicts | `gh pr view --json mergeable` | Send rebase steering to child's `queue/` |
| No spec regression | Contract checks against spec | Block merge |
| Screenshot diff (UI) | Playwright visual comparison (CI step or local) | Flag for human if delta > threshold |
| Lint / type check | CI step (prefer GH Actions if available) | Block merge |

**GitHub Actions integration:**

The orchestrator leverages existing GitHub Actions workflows when available, rather than running quality checks locally:

1. **Discovery**: On orchestrator start, check for workflow files via `ls .github/workflows/*.yml` or `gh api repos/OWNER/REPO/actions/workflows`. Record which quality gates are covered by CI.
2. **Prefer CI over local**: If the repo has a test workflow, don't run tests locally — wait for CI results via `gh pr checks`. This avoids duplicating work and respects the project's actual CI configuration.
3. **CI failure feedback loop**: When a check fails:
   - `gh pr checks <number>` → identify which check failed
   - `gh run view <run-id> --log-failed` → extract actionable error context (last 200 lines)
   - Write failure context as steering to child's `queue/` → child loop fixes and pushes → CI re-runs automatically
   - Max N re-iterations per CI failure (default 3). Same error persisting after N attempts → flag for human.
4. **Required status checks**: If the repo has branch protection with required checks on `agent/trunk`, the orchestrator respects them — it cannot merge until all required checks pass. This is enforced by GitHub, not the orchestrator.
5. **No CI available**: If the repo has no GitHub Actions workflows, the orchestrator falls back to local validation — running tests, lint, and type-check commands discovered during `aloop setup` or configured in `.aloop/config.yml`.
6. **Custom quality gates**: Projects can define additional GH Actions workflows specifically for aloop (e.g., `.github/workflows/aloop-gate.yml`) that run spec-regression checks, coverage threshold enforcement, or screenshot comparisons. The orchestrator treats these like any other required check.

**Agent review gate:**
- Review agent runs against PR diff
- Checks: code quality, spec compliance, no scope creep, test adequacy
- Outputs: approve, request-changes, or flag-for-human
- On request-changes: writes feedback to child's `queue/` as a steering prompt
- Agent review is complementary to CI — CI checks correctness (tests pass), agent checks quality (code is good)

**Merge:**
- Squash merge into `agent/trunk`: runtime executes `gh pr merge --squash --delete-branch`
- Merge conflict: steering to child's `queue/` for rebase (max 2 attempts before human flag)
- After merge: downstream sub-issues may become unblocked → next scan dispatches them
- Label issue `aloop/done`

## Replan

The runtime watches for conditions that trigger replanning. When detected, it queues the appropriate prompt into the orchestrator's `queue/`.

**Trigger: Spec file changed**
1. Runtime detects new commits touching spec glob pattern
2. Extracts diff: `git diff <prev>..<new> -- specs/*.md`
3. Queues `PROMPT_orch_replan.md` with the diff as context
4. Replan agent outputs structured actions:
   - `create_issue(parent, title, body, deps)` — new feature added
   - `update_issue(number, new_body)` — scope changed
   - `close_issue(number, reason)` — feature removed
   - `steer_child(number, instruction)` — in-flight child needs course correction
   - `reprioritize(number, new_wave)` — dependencies shifted
5. Re-triggers spec gap analysis on changed sections

The replan agent reads the spec but does NOT modify it — the spec is human-owned.

**Trigger: Wave completion** — when all sub-issues in a wave merge, queues schedule re-evaluation.

**Trigger: External issue** — human creates issue with `aloop/auto` label → orchestrator absorbs it into plan.

**Trigger: Persistent failures** — child fails repeatedly → replan agent may split the sub-issue, adjust approach, or merge coupled issues.

**Spec backfill:** When gap analysis resolves a question (whether by user answer or autonomous decision), the resolution is written back into `SPEC.md` so the spec stays authoritative.

**Spec consistency agent** (`PROMPT_orch_spec_consistency.md`): Runs after any spec change (backfill, steering, user edit) to reorganize and verify the spec:
- Check cross-references between sections (does section A still agree with section B after the change?)
- Remove contradictions introduced by the change
- Verify acceptance criteria are still testable and consistent with updated requirements
- Ensure clean structure (no orphaned sections, no duplicated concepts, no stale references)
- This is housekeeping — the agent does not add requirements or change intent, only reorganizes and fixes inconsistencies

Triggered by: spec backfill, replan agent spec edits, detected spec file commits. Queued as a follow-up after any spec-modifying operation.

**Spec files are the authoritative intent. Issues are the live execution plan.** They can temporarily diverge (user adds an ad-hoc issue, agent discovers unexpected work) but replan reconciles them.

## Agent/trunk branch

- Created at orchestrator start: `git checkout -b agent/trunk main`
- All child PRs target `agent/trunk` (never main)
- Human reviews `agent/trunk` periodically and promotes to main via PR or fast-forward
- Benefits:
  - Agent velocity isn't blocked by human review cadence
  - Main stays clean — no half-baked agent work
  - Human can cherry-pick from `agent/trunk` if needed
  - Easy rollback: just delete `agent/trunk` and recreate from main

## Orchestrator local state

The orchestrator stores only session-mapping data locally. Issue state, dependencies, waves, and PR status are all read from GitHub.

Stored at `~/.aloop/sessions/<orchestrator-session-id>/sessions.json`:

```json
{
  "spec_files": ["SPEC.md"],
  "trunk_branch": "agent/trunk",
  "concurrency_cap": 3,
  "repo": "owner/repo",
  "children": {
    "11": {
      "session_id": "myapp-20260315-issue11",
      "pid": 12345,
      "worktree": "~/.aloop/sessions/myapp-20260315-issue11/worktree"
    },
    "12": {
      "session_id": "myapp-20260315-issue12",
      "pid": 12346,
      "worktree": "~/.aloop/sessions/myapp-20260315-issue12/worktree"
    }
  },
  "created_at": "2026-03-15T12:00:00Z",
  "last_poll_etag": "W/\"07ad6948c94b...\""
}
```

Everything else — which issues exist, their state, dependencies, wave labels, linked PRs — comes from GitHub via the GraphQL query described above.

## Conflict resolution

When a child PR has merge conflicts with `agent/trunk`:

1. Orchestrator detects via `gh pr view --json mergeable`
2. Reopens the issue with comment: "Merge conflict with agent/trunk — rebase needed"
3. Child loop picks up the issue, rebases its branch, re-pushes
4. PR auto-updates, orchestrator re-reviews

If conflicts persist after 2 rebase attempts → flag for human resolution.

## Provider budget awareness

With N parallel loops, provider costs scale linearly. The orchestrator should:
- Track cumulative token/cost estimates per child (from `log.jsonl`)
- Enforce a session-level budget cap (configurable)
- Pause dispatch when budget threshold is approached
- Report cost breakdown in the final report

## CLI / invocation

```bash
# From spec to parallel execution
aloop orchestrate --spec SPEC.md --concurrency 3 --trunk agent/trunk

# Filter to specific issues
aloop orchestrate --issues 42,43,44

# Pick up existing open issues
aloop orchestrate --label aloop/auto --repo owner/repo

# Dry run — create issues but don't launch loops
aloop orchestrate --spec SPEC.md --plan-only
```

## Relationship to existing components

| Existing Component | Role in Orchestrator |
|-------------------|---------------------|
| `loop.ps1` / `loop.sh` | Runs BOTH orchestrator loop AND child loops — same script, different prompts |
| `loop-plan.json` | Orchestrator: single scan prompt cycle. Children: plan-build-proof-qa-review cycle |
| `queue/` folder | Orchestrator: primary work driver (reactive). Children: steering overrides only |
| `requests/` folder | Orchestrator agents write side-effect requests → runtime processes |
| Frontmatter prompts | Orchestrator has `PROMPT_orch_*.md`, children have `PROMPT_plan/build/review.md` |
| Provider health subsystem | Shared across all loops via `~/.aloop/health/` |
| `active.json` | Tracks all sessions (orchestrator + children) |
| `aloop status` | Shows orchestrator + children in a tree view |

## Resumability

The orchestrator MUST be resumable. If the process is killed (SIGTERM, crash, OOM, user Ctrl-C) and restarted, it picks up exactly where it left off:

1. **GitHub is the source of truth.** On restart, the orchestrator queries GitHub for all `aloop/auto` issues, their states, dependencies, and linked PRs. The full plan is reconstructed from GitHub, not from local files.
2. **Local `sessions.json`** maps issue numbers to child session IDs and PIDs. On restart, the orchestrator checks which children are still alive (`kill -0 PID`), reconnects to live ones, and detects children that completed/failed while the orchestrator was down (via their `status.json`).
3. **Idempotency**: every orchestrator operation must be safe to re-execute. Creating an issue checks if one already exists (by title/label match). Dispatching checks if a child session already exists. Merging checks if PR is already merged.
4. **No work lost**: in-flight child loops continue running independently. They write their own `status.json` and commits. The orchestrator is a coordinator, not a parent process — children are orphan-safe.

**Session resumability behavior:**
- `aloop orchestrate --resume <session-id>` restarts the loop for an existing session
- Reads `orchestrator.json` from the existing session dir
- Does NOT re-decompose if issues already exist in state
- Does NOT re-create GH issues if `gh_number` is already set
- Detects which children are alive (PID check) and which need re-dispatch
- Resumes the scan loop from current state

## Per-task environment requirements

Not all tasks can run in a container. Each task in the decomposition plan may declare environment requirements that the dispatch engine uses to decide execution context:

```yaml
issues:
  - id: 1
    title: "Screenshot all legacy app views"
    wave: 1
    requires: [windows]    # must run on host Windows OS, no container
    sandbox: none

  - id: 2
    title: "Migrate legacy views to React"
    wave: 2
    depends_on: [1]
    requires: []           # default — can run in devcontainer
    sandbox: container
```

**Dispatch rules:**
- `sandbox: container` (default) — child loop runs inside a devcontainer if one is configured
- `sandbox: none` — child loop runs directly on the host OS, no devcontainer isolation
- `requires: [<label>, ...]` — declarative environment labels. The dispatcher checks that the current host satisfies all labels before dispatching. If unsatisfied, the task is queued with a reason.
- Common labels: `windows`, `macos`, `linux`, `gpu`, `docker`, `network-access`
- Tasks with `sandbox: none` skip devcontainer setup entirely and run in a host worktree
- This is analogous to CI runner labels — tasks declare what they need, the dispatcher routes accordingly

## GitHub Enterprise support

All GitHub operations MUST support GitHub Enterprise instances, not just `github.com`:

- The `gh` CLI already handles GHE via `gh auth login --hostname ghes.company.com` — aloop must not hardcode `github.com` anywhere
- Repository URLs, issue URLs, PR URLs, and commit URLs must be derived from the repo's actual remote origin, not constructed with a hardcoded `github.com` prefix
- The convention-file response format (`url` fields in `queue/`) must use the actual GHE hostname
- `aloop orchestrate`, `aloop gh`, and the dashboard's contextual links must all work with any GH-compatible hostname
- No validation or parsing should assume `github.com` as the only valid GitHub host

---

## Adapter pattern

The orchestrator must go through a pluggable adapter interface so it can work with different backends: GitHub, local file-based (no remote needed), GitLab, Gitea, Linear, etc.

### Adapter interface

```typescript
interface OrchestratorAdapter {
  // Issue lifecycle
  createIssue(title: string, body: string, labels: string[]): Promise<{ number: number; url: string }>;
  updateIssue(number: number, update: { body?: string; labels_add?: string[]; labels_remove?: string[]; state?: 'open' | 'closed' }): Promise<void>;
  closeIssue(number: number): Promise<void>;
  getIssue(number: number): Promise<{ number: number; title: string; body: string; state: string; labels: string[] }>;
  listIssues(filters: { labels?: string[]; state?: 'open' | 'closed' | 'all' }): Promise<Array<{ number: number; title: string; state: string }>>;

  // Comments
  postComment(issueNumber: number, body: string): Promise<void>;
  listComments(issueNumber: number, since?: string): Promise<Array<{ id: number; body: string; author: string; created_at: string }>>;

  // PR lifecycle
  createPR(title: string, body: string, head: string, base: string): Promise<{ number: number; url: string }>;
  mergePR(number: number, method: 'squash' | 'merge' | 'rebase'): Promise<void>;
  getPRStatus(number: number): Promise<{ mergeable: boolean; ci_status: 'success' | 'failure' | 'pending'; reviews: Array<{ verdict: string }> }>;

  // Project status (optional — GitHub Projects, Linear states, etc.)
  setIssueStatus?(number: number, status: string): Promise<void>;
}
```

### Planned adapters

| Adapter | Backend | Use Case |
|---------|---------|----------|
| `github` | `gh` CLI | Default — real GitHub/GHE repos |
| `local` | File-based (`.aloop/issues/`) + git branches | Offline development, no remote platform needed |
| `gitlab` | `glab` CLI | GitLab repos |
| `linear` | Linear API | Linear issue tracking |

Don't over-abstract before a second adapter exists. Extract `execGh` calls into the typed adapter, keep GitHub as default, implement local adapter when there's demand.

---

## Scan agent self-healing, diagnostics & alerting

### Required capabilities

**1. Stuck detection with escalation:**
- Track blocker signatures across iterations (hash the blocker description)
- If the same blocker persists for N iterations (configurable, default 5), escalate:
  - Write `diagnostics.json` to session dir with structured blocker info
  - Set a `stuck: true` flag in `orchestrator.json`
  - If configured, pause the loop (write `state: paused` to status.json)

**2. Structured diagnostics:**
- `{sessionDir}/diagnostics.json`: array of current blockers with `{type, message, first_seen_iteration, current_iteration, severity, suggested_fix}`
- Dashboard reads this and displays a banner/panel
- Persisted across iterations (not just text in raw log)

**3. Self-healing for known issues:**
- Missing GitHub labels → create them via `gh label create`
- Missing `config.json` → derive from `meta.json` and `orchestrator.json`
- Unprocessed request files → log exactly which request type is unhandled and why
- Permission errors → log the specific permission needed and suggest fix

**4. User alerting:**
- Write `ALERT.md` in session dir when critical blocker detected
- Dashboard shows alerts as a red banner
- Include: what's blocked, how long, suggested action

### `process-requests` must handle all request types

`process-requests` handles structured result files:
- `epic-decomposition-results.json` → apply decomposition
- `estimate-result-{N}.json` → apply estimates
- `sub-decomposition-result-{N}.json` → apply sub-decomposition

It must also handle request files written by agents (via `processAgentRequests`):
- `create_issues` → create GitHub issues via `gh issue create`
- `update_issue` → update issue state/labels/body
- `close_issue` → close issue
- `dispatch_child` → spawn child loop
- `merge_pr` → merge PR after gates pass
- `post_comment` → post comment on issue/PR
- `steer_child` → write steering to child session

---

## PR review: commit-aware, context-preserving

1. **Commit SHA tracking** — store the HEAD commit SHA when a PR is reviewed. Only re-review if new commits were pushed since. Prevents review spam.

2. **Comment history in review prompt** — fetch existing PR comments and include them in the review prompt with instruction: "Do NOT repeat feedback already given. Only comment on NEW issues or acknowledge fixes."

3. **Conversation-aware review** — the agent sees the full review thread and can:
   - Acknowledge issues that were fixed since last review
   - Focus only on remaining/new issues
   - Provide a final "all clear" when everything is addressed

**Implementation:**
- `invokeAgentReview` checks `last_reviewed_sha` on the issue — skips if HEAD hasn't changed
- When queuing review prompt, fetches `gh pr view --json comments` and appends to prompt
- Review verdict parsed from agent output (fallback) or result file (preferred)

---

## Self-healing: failed issue recovery

`failed` must not be a terminal state. Every `process-requests` pass scans `failed` issues and recovers them automatically:

| Condition | Recovery |
|-----------|----------|
| `needs_redispatch` + has open PR | → `pr_open` (lifecycle re-evaluates, dispatches child) |
| `needs_redispatch` + no PR | → `pending` (fresh dispatch) |
| Has open PR (any) | → `pr_open` (clear dead child session, reset rebase counter) |
| No PR + dead/no child | → `pending` (fresh dispatch) |
| `status === 'Done'` (scan-agent closed) | No recovery — intentionally closed |

### Merge conflict resolution

When a PR has merge conflicts, the orchestrator dispatches a child agent to rebase — it does NOT just post a comment. The child receives explicit instructions to `git rebase` onto the trunk branch and force-push.

- Each conflict triggers a `needs_redispatch` with rebase-specific instructions
- No hard cap on rebase attempts — each attempt dispatches a real agent
- The `rebase_attempts` counter tracks attempts for diagnostics only

### Persistent CI failure

When the same CI failure signature persists across `ORCHESTRATOR_CI_PERSISTENCE_LIMIT` (3) attempts:

1. Close the failing PR with an explanatory comment
2. Reset the issue to `pending` with clean state (no failure counters)
3. Fresh dispatch builds from scratch on a new branch

This avoids the "failed forever" trap while preventing infinite loops on the same broken approach.

### V8 code cache cleanup

Provider CLIs (claude, opencode) create V8 code cache `.so` files in `/tmp` that can fill the tmpfs (13GB+ observed).

- **Per-session** (good): child loops get `NODE_COMPILE_CACHE=<sessionDir>/.v8-cache`, cleaned on completion
- **Global** (stopgap): `process-requests` periodically deletes `.da*.so` files in `/tmp` older than 60 minutes — this is a blunt workaround that may delete files belonging to other processes

---

## Synthetic orchestrator test scenario

Defines a reproducible end-to-end test scenario that validates the orchestrator's full lifecycle: decomposition, dependency resolution, parallel dispatch, CI gate enforcement, PR flow, merge, and resumability.

### Safety constraints

All test activity MUST be isolated from the target repo's production branches:

- **Branch**: all work happens on `aloop/test/<timestamp>` branches — never `main`, `master`, or `develop`
- **Issues**: all created issues are labeled `aloop/test` in addition to `aloop/auto` — enables cleanup queries
- **PRs**: all PRs target the test trunk branch (`aloop/test/<timestamp>/trunk`), never the repo's default branch
- **Cleanup**: a cleanup script (`aloop test cleanup --before <timestamp>`) deletes all test branches, closes test issues, and closes test PRs
- **No force push**: test branches follow the same no-force-push policy as production branches
- **Idempotent**: running the test scenario twice produces independent test runs (different timestamps), not conflicts

### Test scenario phases

**Phase 1 — Decomposition validation:**
1. Orchestrator reads a test spec (a subset of a known spec, stored at `aloop/test-fixtures/...`)
2. Produces epic issues and sub-issues on the target repo
3. **Verify**: issue count is within expected range, dependencies form a valid DAG, wave labels are assigned, no circular dependencies

**Phase 2 — Dispatch validation:**
1. Orchestrator dispatches wave 1 child loops (up to concurrency cap)
2. Each child loop starts in its own worktree on its own branch
3. **Verify**: child sessions appear in `active.json`, each has a valid PID, worktree exists, `loop-plan.json` is compiled

**Phase 3 — CI gate validation:**
1. At least one child loop completes its cycle and creates a PR
2. PR targets the test trunk branch
3. Orchestrator waits for CI checks (or simulated check status)
4. **Verify**: PR is created with correct target branch, CI check status is read, merge only proceeds on green checks

**Phase 4 — Merge and dependency unblock:**
1. A wave 1 PR passes CI and is merged into trunk
2. Wave 2 issues that depended on the merged issue become eligible for dispatch
3. **Verify**: dependency resolution correctly unblocks downstream issues, wave 2 child loops are dispatched

**Phase 5 — Resumability validation:**
1. Kill the orchestrator process (SIGTERM)
2. Restart with `aloop orchestrate --resume`
3. **Verify**: orchestrator reconstructs state from GitHub issues, detects which children are alive (via PID check), does not re-dispatch already-running children, does not re-create existing issues
