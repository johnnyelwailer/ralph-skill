# Research Log

## 2026-03-14 — Initial gap analysis: project structure and implementation state [T2]

### Project Overview
Ralph-skill is the development/source repo for "Ralph", an autonomous AI coding methodology packaged as an installable skill for Claude Code, Codex CLI, GitHub Copilot, and Gemini CLI. It also includes an "aloop" dashboard concept.

### Tracked vs Untracked
- **Tracked:** `install.ps1`, `uninstall.ps1`, `README.md`, `.gitignore`, `claude/`, `copilot/`, `ralph/`
- **Untracked:** `aloop/` (dashboard dist only, no source), `docs/` (DESIGN_BRIEF.md)
  - Source: `git status` output at conversation start (T2)

### Core Runtime — Fully Implemented
- `ralph/bin/loop.sh` (597 lines) — Bash loop engine with full multi-provider, round-robin, stuck detection, steering, provider timeout, remote backup
  - Source: `/Users/pj/Dev/ralph-skill/ralph/bin/loop.sh` (T2 — direct inspection)
- `ralph/bin/loop.ps1` (797 lines) — PowerShell equivalent with same feature set
  - Source: `/Users/pj/Dev/ralph-skill/ralph/bin/loop.ps1` (T2 — direct inspection)
- `ralph/bin/setup-discovery.ps1` (634 lines) — Project discovery, language detection, config scaffolding
  - Source: `/Users/pj/Dev/ralph-skill/ralph/bin/setup-discovery.ps1` (T2 — direct inspection)
- All 4 prompt templates exist and are complete (plan, build, review, steer)
  - Source: `ralph/templates/PROMPT_{plan,build,review,steer}.md` (T2 — direct inspection)

### Skill & Command Files — Fully Implemented
- Claude Code: SKILL.md + 5 slash commands (setup, start, status, stop, steer) + 4 reference files
  - Source: `claude/commands/ralph/` and `claude/skills/ralph/` (T2)
- Copilot: 4 prompt files (setup, start, status, stop — no steer equivalent)
  - Source: `copilot/prompts/` (T2)

### Installer/Uninstaller — Fully Implemented
- `install.ps1` — Multi-harness, CLI detection, interactive menu, dry-run, force mode
- `uninstall.ps1` — Selective removal, dry-run, force mode
  - Source: both files at repo root (T2)

### Gaps Identified

1. **No SPEC.md** — README.md is the de facto spec. No formal spec document exists.
   - Source: `find` for SPEC.md returned no results (T2)

2. **Dashboard source code missing** — `aloop/cli/dashboard/dist/` contains compiled React app (391KB JS, 20KB CSS) but no source files (no package.json, no src/, no tsconfig). The dist appears to be from a separate build process.
   - Source: `aloop/` directory listing (T2), DESIGN_BRIEF.md describes intended architecture (T3)

3. **Worktree isolation partially implemented** — `config.yml` has `worktree_default: true`, and `/ralph:start` command describes worktree setup in its prompt, but the loop scripts themselves (`loop.sh`, `loop.ps1`) don't create worktrees — they expect the caller (the `/ralph:start` command) to handle it.
   - Source: `ralph/config.yml:7`, `ralph/bin/loop.sh`, `ralph/bin/loop.ps1` (T2)

4. **Per-phase reasoning effort** — Not implemented in loop scripts. Memory file documents requirements and API details but no code changes made.
   - Source: Memory `project_reasoning_effort.md` (T3), loop scripts lack any reasoning effort logic (T2)

5. **Orchestrator** — Not implemented. Memory files describe requirements (pluggable adapters, resumability, per-task sandbox policy) but no orchestrator code exists in the repo.
   - Source: Memory files (T3), no orchestrator code found in codebase (T2)

6. **GitHub Enterprise support** — Not implemented. Memory file documents requirement but `gh` CLI calls in the codebase don't handle custom hostnames.
   - Source: Memory `project_github_enterprise.md` (T3), code inspection (T2)

7. **`active.json` / `history.json`** — Referenced by SKILL.md and copilot prompts but not created by loop scripts. The `/ralph:start` and `/ralph:stop` commands describe managing these files, but it's the AI agent (executing the command) that creates them, not the loop script itself.
   - Source: `claude/skills/ralph/SKILL.md:63`, copilot status/stop prompts (T2)

8. **Codex CLI harness** — `install.ps1` supports installing to `~/.codex/skills/ralph/` and `~/.codex/commands/ralph/`, but no Codex-specific command files exist in the source repo (only Claude and Copilot). The installer copies the same Claude files.
   - Source: `install.ps1` harness definitions (T2)

9. **Gemini CLI integration** — Listed as supported provider in README but no Gemini-specific skill/command files or prompts exist. Gemini support is via the loop scripts only (stdin prompt piping).
   - Source: README.md provider table, absence of gemini/ directory (T2)

10. **`docs/` directory untracked** — DESIGN_BRIEF.md exists but isn't committed.
    - Source: git status (T2)

## 2026-03-14 — Planning recheck: verify existing gaps and surface new findings [T2]

### Verified — all 10 gaps from initial analysis still hold
- No SPEC.md exists (confirmed: glob search returned no results) — Source: `Glob SPEC.md` at repo root (T2)
- No `PROMPT_proof.md` template — only plan/build/review/steer templates exist in `ralph/templates/` — Source: `ralph/templates/` directory listing (T2)
- No `PROMPT_setup.md` template — setup is handled by slash command + `setup-discovery.ps1`, not by the loop engine — Source: `ralph/templates/` directory listing (T2)
- Copilot still lacks `/ralph-steer` prompt — Source: `copilot/prompts/` directory listing (T2)
- No orchestrator code exists anywhere in repo — Source: grep for `orchestrat` across `*.{md,ps1,sh,yml}` returned no code results (T2)
- No GitHub Enterprise handling — grep for `github.*enterprise|GHE_|GITHUB_HOST` returned no results — Source: grep across `*.{md,ps1,sh}` (T2)

### New finding: loop cycle structure confirmed as 5-step
- `loop.sh:147` documents the cycle as "5-step cycle: plan -> build -> build -> build -> review"
- This matches README ("1 plan, 3 builds, 1 review") and SKILL.md
- Source: `/Users/pj/Dev/ralph-skill/ralph/bin/loop.sh:147` (T2)

### New finding: review template has 5 gates (not 8)
- Gates: 1) Spec Compliance, 2) Test Depth, 3) Coverage (≥80%), 4) Code Quality, 5) Integration Sanity
- No proof/layout/version gates exist in current codebase — these may be from a planned future version
- Source: `/Users/pj/Dev/ralph-skill/ralph/templates/PROMPT_review.md:24-69` (T2)

### New finding: model defaults may need updating
- `loop.sh` defaults: opus, gpt-5.3-codex, gemini-3.1-pro-preview, copilot: gpt-5.3-codex
- `config.yml` matches these defaults
- Comment in `loop.sh:27`: "keep in sync with ~/.ralph/config.yml (source of truth)"
- These were set as of recent commits; staleness should be periodically checked
- Source: `/Users/pj/Dev/ralph-skill/ralph/bin/loop.sh:28-32`, `/Users/pj/Dev/ralph-skill/ralph/config.yml` (T2)

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
