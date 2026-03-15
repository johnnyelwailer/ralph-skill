# Research Log

## 2026-03-15 15:29Z — P0 research decision: GitHub-native progression with minimal-label fallback [T3+T2]

- Decision finalized: issue progression is represented by **Project status + issue state** (`open/closed`) as primary truth; progression labels are not required for normal state transitions.
- Required minimal labels retained where native signals are insufficient:
  - `aloop` (single tracker scope label for orchestrator-owned issues)
  - `aloop/spec-question` (blocking clarification artifact)
  - `aloop/blocked-on-human` (explicit human-blocked condition)
  - `aloop/auto-resolved` (autonomy-resolution provenance)
  - `aloop/wave-*` (scheduling metadata, not progression)
- Implementation alignment completed in this iteration:
  - Orchestrator issue creation now uses `aloop` + `aloop/wave-*` labels (removed `aloop/auto` issuance).
  - GH policy enforcement now validates an `aloop` tracking scope (with legacy acceptance of `aloop/auto` for compatibility).
  - Request processor defaults switched from `aloop/auto` to `aloop` for issue-create/issue-close scoping.
  - Tests updated to assert `aloop` tracking behavior.

## 2026-03-07 18:33 +01:00 — Devcontainer spec baseline for `/aloop:devcontainer` [T1+T2+T3]

- Confirmed authoritative sources and scope for implementation:
  - Use `containers.dev` implementor spec/reference as source of truth for `devcontainer.json` shape and lifecycle semantics.
  - Use VS Code devcontainer docs for CLI workflow and operational patterns.
  - Source: https://containers.dev/implementors/spec/ (T1), https://containers.dev/implementors/json_reference/ (T1), https://code.visualstudio.com/docs/devcontainers/create-dev-container (T1), `SPEC.md` devcontainer prerequisite section (T3)
- Lifecycle order to implement in generated configs and verification expectations:
  - `initializeCommand` (host) runs before container start, then `onCreateCommand` -> `updateContentCommand` -> `postCreateCommand`; on every start/attach: `postStartCommand` then `postAttachCommand`.
  - `waitFor` defaults to `updateContentCommand`.
  - Source: https://containers.dev/implementors/json_reference/ (T1), https://containers.dev/implementors/spec/ (T1)
- `devcontainer.json` constraints for generation:
  - `features` is a map keyed by feature ID (`ghcr.io/devcontainers/features/...`) with option objects.
  - `mounts` accepts Docker `--mount` syntax (string or object form).
  - Variable substitution supports `${localEnv:VAR}`, `${containerEnv:VAR}`, `${localWorkspaceFolder}`, `${containerWorkspaceFolder}` and related forms.
  - Source: https://containers.dev/implementors/json_reference/ (T1), https://containers.dev/implementors/features/ (T1)
- Environment forwarding semantics that affect provider auth strategy:
  - `containerEnv` applies to all processes in the container.
  - `remoteEnv` applies to VS Code and its subprocesses/terminals; can reference `${containerEnv:PATH}` and `${localEnv:VAR}`.
  - Source: https://code.visualstudio.com/remote/advancedcontainers/environment-variables (T1)
- Workspace/worktree mounting decisions for upcoming implementation:
  - VS Code defaults source mount to project root (or git root if `git` exists); override with `workspaceMount` + `workspaceFolder` when needed.
  - For Aloop worktrees under `~/.aloop/sessions/<id>/worktree`, plan to ensure explicit mount accessibility plus `devcontainer exec --workspace-folder <worktree>`.
  - Source: https://code.visualstudio.com/remote/advancedcontainers/change-default-source-mount (T1), `SPEC.md` devcontainer integration/worktree sections (T3)
- Docker Compose support remains first-class and should be augmentation-safe:
  - Existing `.devcontainer` setups may use `dockerComposeFile` + `service`; generation flow should augment, not replace, existing config.
  - Source: https://code.visualstudio.com/docs/devcontainers/create-dev-container (T1), https://code.visualstudio.com/remote/advancedcontainers/connect-multiple-containers (T1), `TODO.md` devcontainer/P1 augmentation task (T3)
- CLI command behaviors required for verification loop:
  - `devcontainer build`, `devcontainer up`, `devcontainer exec`, and `devcontainer read-configuration` are documented and should be used in verification/fail-fix-reverify flow.
  - Source: https://code.visualstudio.com/docs/devcontainers/devcontainer-cli (T1), https://github.com/devcontainers/cli (T1), `SPEC.md` devcontainer verification requirements (T3)
- Local environment check for this machine:
  - `devcontainer` CLI is currently not installed in this workspace environment (`Get-Command devcontainer` returns not found).
  - Source: command run `Get-Command devcontainer -ErrorAction SilentlyContinue`; command run `if (Get-Command devcontainer -ErrorAction SilentlyContinue) { devcontainer --version } else { Write-Output "devcontainer CLI not installed" }` (T2)


## 2026-03-15 — GitHub-native state model: full API contract research [P0]

### Motivation
The orchestrator needs a state model for tracking issues, their lifecycle status, dependencies, and progress. GitHub Issues alone only offer `open`/`closed` — insufficient for orchestrator workflows. **GitHub Projects V2** provides fully custom status columns (single-select fields) that map directly to orchestrator phases.

### Prerequisites
- **OAuth scope**: `read:project` (read) and `project` (write) are required for Projects V2 API
- **Setup action**: user must run `gh auth refresh -s project` to add the scope
- **Orchestrator setup skill should detect and prompt for this automatically**
- Source: live testing against `gh api graphql` — `INSUFFICIENT_SCOPES` error without `project` scope (T2)

---

### 1. Issue States (native)

Only two states on issues themselves:
- `state`: `"open"` | `"closed"`
- `state_reason`: `"completed"` | `"not_planned"` | `"duplicate"` | `"reopened"` | `null`

Set via: `PATCH /repos/{o}/{r}/issues/{n}` with `{"state": "closed", "state_reason": "completed"}`
GraphQL: `closeIssue(input: {issueId, stateReason: COMPLETED | NOT_PLANNED | DUPLICATE})`

Source: GitHub REST API docs, verified via `gh api` (T2)

### 2. Projects V2 — Custom Status (the real state machine)

Projects V2 provides a **Status** field (type `SINGLE_SELECT`) with fully custom options. This is the key primitive for orchestrator state management.

**Default options** (on project creation):
| Option | Color | ID (regenerated on update) |
|--------|-------|---------------------------|
| Todo | GREEN | (dynamic) |
| In Progress | YELLOW | (dynamic) |
| Done | PURPLE | (dynamic) |

**Custom options** — fully supported. Verified by adding "Blocked" (RED) to project #1:
```graphql
mutation {
  updateProjectV2Field(input: {
    fieldId: "<status-field-id>"
    singleSelectOptions: [
      {name: "Todo", color: GREEN, description: "Not started"}
      {name: "In Progress", color: YELLOW, description: "Actively being worked on"}
      {name: "Blocked", color: RED, description: "Blocked by dependency"}
      {name: "In Review", color: BLUE, description: "PR under review"}
      {name: "Done", color: PURPLE, description: "Completed"}
    ]
  }) {
    projectV2Field { ... on ProjectV2SingleSelectField { options { id name color } } }
  }
}
```

**Important**: Options are matched by **name**, not id. Option IDs are regenerated on every `updateProjectV2Field` call. Always re-read option IDs after updating the field.

Available colors: `GRAY`, `BLUE`, `GREEN`, `YELLOW`, `ORANGE`, `RED`, `PINK`, `PURPLE`

Source: live mutation against `johnnyelwailer/projects/1`, GraphQL schema introspection (T2)

### 3. Moving Items Between Statuses

```graphql
mutation {
  updateProjectV2ItemFieldValue(input: {
    projectId: "<project-node-id>"
    itemId: "<item-node-id>"
    fieldId: "<status-field-id>"
    value: { singleSelectOptionId: "<option-id>" }
  }) { projectV2Item { id } }
}
```

The `value` input accepts: `text`, `number`, `date`, `singleSelectOptionId`, `iterationId`

Source: GraphQL schema introspection of `ProjectV2FieldValue` input type, live mutation verified (T2)

### 4. Adding Issues to a Project

```graphql
mutation {
  addProjectV2ItemById(input: {
    projectId: "<project-node-id>"
    contentId: "<issue-or-pr-node-id>"
  }) { item { id } }
}
```

CLI equivalent: `gh project item-add <project-number> --owner <owner> --url <issue-url>`

Source: GitHub GraphQL docs, `gh project` CLI (T2)

### 5. Reading Project Items + Status

CLI: `gh project item-list <number> --owner <owner> --format json`
Returns: `{items: [{id, title, status, content: {id, title, type, body}}]}`

GraphQL bulk query:
```graphql
query($projectId: ID!, $cursor: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { ... on Issue { id number title state } ... on PullRequest { id number title state } }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
              ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
            }
          }
        }
      }
    }
  }
}
```

Source: live query verified against project #1 (T2)

### 6. All Available Field Types

From GraphQL `ProjectV2FieldType` enum:
`TITLE`, `TEXT`, `SINGLE_SELECT`, `NUMBER`, `DATE`, `ITERATION`, `ASSIGNEES`, `LABELS`, `MILESTONE`, `REPOSITORY`, `REVIEWERS`, `LINKED_PULL_REQUESTS`, `TRACKS`, `TRACKED_BY`, `ISSUE_TYPE`, `PARENT_ISSUE`, `SUB_ISSUES_PROGRESS`

Source: GraphQL schema introspection (T2)

### 7. Sub-issues (GA, all plans)

- **50 sub-issues/parent**, **8 nesting levels**
- REST: `GET/POST /repos/{o}/{r}/issues/{n}/sub_issues`, `GET .../parent`
- GraphQL: `addSubIssue`, `removeSubIssue`, `reprioritizeSubIssue` mutations
- Query: `issue { subIssues(first:50) { nodes { id number title state } } subIssuesSummary { total completed percentCompleted } parent { id number } }`
- Every issue object includes `sub_issues_summary: {total, completed, percent_completed}`

Source: GitHub REST/GraphQL docs, schema introspection (T2)

### 8. Issue Dependencies (GA)

- **50 per relationship type** per issue
- GraphQL: `addBlockedBy(input: {issueId, blockingIssueId})` / `removeBlockedBy`
- Query: `issue { blockedBy(first:50) { nodes { id number } } blocking(first:50) { nodes { id number } } issueDependenciesSummary { blockedBy totalBlockedBy blocking totalBlocking } }`
- REST: `/repos/{o}/{r}/issues/{n}/issue-dependencies`
- Search filters: `is:blocked`, `is:blocking`, `blocked-by:<n>`, `blocking:<n>`

Source: GitHub changelog 2025-08-21 (dependencies GA), schema introspection (T2)

### 9. Labels

- Max **100 labels/issue**, name max **50 chars**, description max **100 chars**
- Full CRUD: `POST /repos/{o}/{r}/labels`, `POST /repos/{o}/{r}/issues/{n}/labels`

Source: GitHub REST API docs, community discussions (T2)

### 10. Efficient Polling

**ETag/conditional requests:**
- Issues list returns `Etag` header; `304 Not Modified` is **free** (no rate limit cost)
- `since` param: `GET /repos/{o}/{r}/issues?since=<ISO8601>` — only issues updated after timestamp
- `If-Modified-Since` header also supported

**GraphQL bulk queries:**
- ~172 points for 100 issues with all connections (budget: 5,000 pts/hr standard, 10,000 enterprise)
- Max nodes per query: 500,000

Source: GitHub best practices docs, live ETag header inspection (T2)

### 11. Webhooks

- `issues` event: `opened, closed, reopened, labeled, unlabeled, assigned, milestoned, edited, deleted`
- `sub_issues` event: add/remove sub-issue, add/remove parent
- Issue dependencies: supported in webhooks (GA)
- `pull_request` event: `opened, closed, labeled, synchronize, ready_for_review`
- `projects_v2_item` event: fires when project items are created, edited, deleted, archived, restored, reordered, or converted

Source: GitHub webhook docs, changelog (T2)

### 12. Metadata Storage

- Issue body: **65,536 codepoint** limit — embed YAML/JSON in HTML comments or frontmatter
- Assignees: max **10/issue**
- Milestones: **1 per issue** (useful for wave grouping)
- Custom issue fields (org-level, preview): up to 25 per org

Source: GitHub docs (T2)

---

### Recommended Orchestrator State Model

**Use Projects V2 as the primary state machine**, not just `open`/`closed`:

| Status | Color | Meaning |
|--------|-------|---------|
| Backlog | GRAY | Decomposed but not yet scheduled |
| Todo | GREEN | Scheduled in current wave |
| In Progress | YELLOW | Child loop actively working |
| Blocked | RED | Waiting on dependency |
| In Review | BLUE | PR created, under review |
| Done | PURPLE | PR merged |

**Minimal local state** (`sessions.json`): `{issue_number → {session_id, pid}}` — just for PID tracking. Everything else lives in GitHub.

**Setup requirement**: The setup skill must ensure `gh auth` has `project` scope:
```bash
# Check if scope exists
gh auth status 2>&1 | grep -q 'project' || gh auth refresh -s project
```
