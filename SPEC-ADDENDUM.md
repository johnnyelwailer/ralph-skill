# SPEC Addendum: Aloop — New Features & Implementation Gaps

This addendum covers features and clarifications not yet in `SPEC.md`. It follows the same conventions: acceptance criteria are machine-verifiable where possible, and cross-references point to the relevant `SPEC.md` sections.

---

## Prompt Content Rule: Reference Files, Never Embed

Orchestrator prompts (decompose, gap analysis, estimation, sub-decompose, etc.) must **never embed file contents** in the prompt body. Instead, reference files by path and let the agent read them from the worktree.

**Why:** SPEC.md alone is 220KB. Embedding it in a queue prompt creates a 220KB+ prompt file that wastes tokens, slows iteration, and may exceed context limits. The agent runs in a git worktree with full project access — it can read any file.

**Rule:** Queue prompts must only contain:
- The task instructions (the agent prompt template)
- File paths to read (e.g., "Read `SPEC.md` and `SPEC-ADDENDUM.md` from the project")
- The output path for results (absolute, pointing to session dir)
- Contextual metadata (issue numbers, titles, wave info — small structured data)

**Never embed:** spec content, source code, large JSON payloads, or any content the agent can read from disk.

### Acceptance Criteria

- [ ] No queue prompt file exceeds 10KB (excluding frontmatter)
- [ ] All spec references use file paths, not inline content
- [ ] Decompose, gap analysis, estimation, and sub-decompose prompts reference files by path

---

## Dashboard Component Architecture (Mandatory Refactor)

### Purpose

The dashboard is currently a monolithic 2085-line `AppView.tsx`. This must be decomposed into small, focused component files — each roughly **~150 lines of code** maximum. Every component must have a corresponding test file and Storybook story. This is not optional polish — it is a prerequisite for all other dashboard work.

### File Size Convention

**Target: ~150 LOC per file.** This applies to all source files across the project, not just the dashboard. Files above 200 LOC should be split. Files above 300 LOC are a code smell and must be decomposed before adding new features.

This convention applies to:
- React components (`.tsx`)
- Utility modules (`.ts`)
- Test files (`.test.ts`, `.test.tsx`) — split by feature, not one giant test file
- Story files (`.stories.tsx`) — one per component

### Component Decomposition

`AppView.tsx` (2085 lines) must be split into focused components. Suggested structure:

```
aloop/cli/dashboard/src/
  components/
    layout/
      AppShell.tsx              # Top-level layout (sidebar + main + docs)
      Sidebar.tsx               # Session list sidebar
      MainPanel.tsx             # Central content area
      DocsPanel.tsx             # Right-side docs/tabs panel
      ResponsiveLayout.tsx      # Breakpoint logic, mobile hamburger
    session/
      SessionCard.tsx           # Single session entry in sidebar
      SessionList.tsx           # Scrollable session list
      SessionDetail.tsx         # Selected session detail view
    activity/
      ActivityLog.tsx           # Log entry list
      LogEntry.tsx              # Single log line (expandable)
      IterationDetail.tsx       # Expanded iteration with output
    health/
      ProviderHealth.tsx        # Provider health table
      HealthIndicator.tsx       # Single provider status (circle + label)
    steering/
      SteerInput.tsx            # Steering textarea + send button
      SteerHistory.tsx          # Previous steering messages
    artifacts/
      ArtifactViewer.tsx        # Image/file preview
      ComparisonWidget.tsx      # Before/after (side-by-side, slider, overlay)
      ProofManifest.tsx         # Proof manifest display
    progress/
      IterationProgress.tsx     # Current iteration progress bar
      CycleIndicator.tsx        # Cycle position visualization
      CostDisplay.tsx           # Token/cost display per iteration
    shared/
      AnsiRenderer.tsx          # ANSI → styled HTML
      MarkdownRenderer.tsx      # Markdown → HTML
      CommandPalette.tsx        # Ctrl+K search overlay
      ElapsedTimer.tsx          # Live-counting timer
    ui/                         # (existing Radix primitives — keep as-is)
      button.tsx
      card.tsx
      ...
  hooks/
    useSession.ts               # Session state management
    useSSE.ts                   # Server-sent events connection
    useSteering.ts              # Steering input logic
    useTheme.ts                 # Dark/light mode
  lib/
    ansi.ts                     # ANSI parsing utilities (extract from AppView)
    format.ts                   # Formatting helpers (duration, tokens, etc.)
    types.ts                    # Shared TypeScript interfaces
```

### Per-Component Requirements

Every component file must have:

1. **Component file** (`Foo.tsx`, ~150 LOC) — single responsibility, typed props
2. **Test file** (`Foo.test.tsx`) — unit tests with Testing Library, covering props, states, interactions
3. **Story file** (`Foo.stories.tsx`) — at least 2-3 stories covering key visual states

### Migration Strategy

The refactor is incremental — extract one component at a time from `AppView.tsx`, add tests and stories, verify the dashboard still works. Do NOT rewrite from scratch. Order:

1. Extract utilities first (`ansi.ts`, `format.ts`, `types.ts`) — these have no UI dependencies
2. Extract leaf components (HealthIndicator, LogEntry, CostDisplay) — smallest, most testable
3. Extract composite components (ActivityLog, SessionCard, ProviderHealth)
4. Extract layout components (Sidebar, MainPanel, DocsPanel)
5. Finally, `AppView.tsx` becomes a thin shell importing layout components (~50-100 LOC)

### Acceptance Criteria

- [ ] No source file in `dashboard/src/` exceeds 200 LOC (excluding `ui/` primitives)
- [ ] `AppView.tsx` is reduced to <100 LOC (layout shell only)
- [ ] Every component in `components/` has a corresponding `.test.tsx` file
- [ ] Every component in `components/` has a corresponding `.stories.tsx` file
- [ ] Dashboard renders identically before and after the refactor (visual regression via Playwright screenshot)
- [ ] All existing tests continue to pass
- [ ] `npm run test` covers the new component tests
- [ ] `npm run storybook` renders all component stories

---

## Storybook Integration (Component Iteration)

### Purpose

Storybook provides an isolated environment for developing, testing, and iterating on dashboard UI components outside the full application context. This accelerates the proof and review cycles for UI work — agents can render individual components in Storybook, capture screenshots, and iterate without spinning up the full dashboard server.

### Configuration

- **Storybook 8** with `@storybook/react-vite` as the framework adapter
- Lives in `aloop/dashboard/.storybook/` alongside the existing Vite + React dashboard
- Uses the same Tailwind CSS config, Radix UI primitives, and shadcn-style component library already specified in `SPEC.md` (see **UX: Dashboard, Start Flow, Auto-Monitoring**)

### Story File Convention

Stories are colocated with their components:

```
aloop/dashboard/src/components/
  SessionCard.tsx
  SessionCard.stories.tsx
  ProviderHealth.tsx
  ProviderHealth.stories.tsx
  SteerInput.tsx
  SteerInput.stories.tsx
```

Each `*.stories.tsx` file exports:
- A `default` meta object with `component`, `title`, and decorator for Tailwind/dark-mode context
- Named exports for each visual state (e.g., `Running`, `Stopped`, `Unhealthy`, `DarkMode`)

### Integration with Agent Workflow

- **Build agent** — when implementing or modifying a dashboard component, the build agent creates or updates the corresponding `*.stories.tsx` alongside the component
- **Proof agent** — can launch Storybook in CI mode (`npx storybook build`) and capture screenshots of individual stories for vision-model review, as an alternative to launching the full dashboard
- **Review agent** — can reference Storybook screenshots for visual regression checks

### Theme & Design Token Parity

Storybook must render components with the same theme context as the dashboard:
- A global decorator wraps all stories with the Tailwind `.dark` class toggle and CSS custom properties defined in the dashboard's `index.css`
- `@storybook/addon-themes` or a custom decorator provides a light/dark toggle in the Storybook toolbar
- Components rendered in Storybook must be visually identical to their dashboard appearance

### Acceptance Criteria

- [ ] Storybook 8 is configured with `@storybook/react-vite` in `aloop/dashboard/.storybook/`
- [ ] `npm run storybook` (or `bun run storybook`) launches Storybook from the dashboard directory
- [ ] Stories are colocated with components as `*.stories.tsx` files
- [ ] At least one story exists for each core dashboard component (SessionCard, ProviderHealth, SteerInput, ActivityLog, ProgressBar)
- [ ] A global decorator applies Tailwind + dark mode context to all stories
- [ ] `npx storybook build` produces a static build suitable for CI screenshot capture
- [ ] Storybook uses the same Tailwind config and CSS custom properties as the dashboard

---

## Dashboard Responsiveness

### Purpose

The dashboard is currently desktop-only. A responsive layout enables monitoring and steering from mobile devices and tablets — critical for the tunnel/remote-control use case where an operator checks loop status from a phone while away from their workstation.

### Breakpoints

| Breakpoint | Width | Tailwind prefix | Layout behavior |
|------------|-------|-----------------|-----------------|
| Mobile | < 640px | (default) | Single column, stacked panels |
| Tablet | 640px - 1024px | `sm:` / `md:` | Two-column where useful, collapsible sidebar |
| Desktop | > 1024px | `lg:` | Full layout with persistent sidebar |

These align with Tailwind's default breakpoint system. Mobile-first: base styles target mobile, progressively enhanced at `sm:`, `md:`, `lg:`.

### Layout Changes per Breakpoint

**Mobile (< 640px):**
- Sidebar collapses into a hamburger menu (top-left icon)
- Session list becomes a vertically scrollable stack
- Activity log occupies full width below session details
- Steer input is fixed at the bottom of the viewport (always accessible)
- Docs panel tabs collapse into a single dropdown selector
- Command palette (`Ctrl+K`) becomes a full-screen overlay
- Provider health moves from a sidebar tab to an expandable section in the main view

**Tablet (640px - 1024px):**
- Sidebar is collapsible (hidden by default, toggled via `Ctrl+B` / hamburger)
- Session details and activity log are side-by-side when sidebar is hidden
- When sidebar is visible, content area stacks vertically
- Steer input remains inline (not fixed)

**Desktop (> 1024px):**
- Full three-column layout: sidebar (sessions) | main (details + log) | docs panel
- All panels visible simultaneously
- No layout changes from current design intent

### Touch Considerations

- Tap targets minimum 44x44px on mobile (WCAG 2.5.8)
- Swipe gesture: swipe right from left edge opens sidebar on mobile
- Long-press on session card opens context menu (stop, force-stop, copy session ID)
- No hover-only interactions — all tooltips/hover-cards must have tap equivalents

### Cross-Reference

This extends the dashboard specification in **UX: Dashboard, Start Flow, Auto-Monitoring** in `SPEC.md`. The component list, SSE protocol, theme system, and keyboard shortcuts defined there remain unchanged. This section adds responsive layout behavior only.

### Acceptance Criteria

- [x] Dashboard renders without horizontal scroll at 320px viewport width
- [x] Sidebar collapses to hamburger menu below 640px
- [x] Steer input is accessible (visible or one tap away) at all breakpoints
- [x] All tap targets are at least 44x44px on mobile viewports
- [x] Session list is scrollable and usable on a 375px-wide viewport (iPhone SE)
- [x] `Ctrl+B` / hamburger toggle works at tablet breakpoint
- [x] Desktop layout is unchanged from the current spec
- [x] No hover-only interactions — all have tap/click equivalents
- [x] Lighthouse mobile accessibility score >= 90

---

## OpenRouter Cost Monitoring (via OpenCode CLI)

### Purpose

Surface cost and usage data in the dashboard so operators can track spend in real-time, see per-session cost breakdowns, and receive warnings before hitting budget caps. This extends the basic token/price tracking already specified in **Parallel Orchestrator Mode > Basic Token/Price Tracking** in `SPEC.md`.

### Data Source: OpenCode CLI (No Auth Key Required)

All cost data is obtained through OpenCode's public CLI interface — **no reading of internal files like `auth.json` or direct SQLite access**. OpenCode provides three methods:

**1. Per-session cost — `opencode export <sessionID>` (already implemented in loop.sh)**

Returns full session JSON with per-message cost and token data:

```json
{
  "messages": [
    {
      "role": "assistant",
      "tokens": { "input": 15200, "output": 3400, "cache": { "read": 48000 } },
      "cost": 0.0034,
      "modelID": "openrouter/anthropic/claude-sonnet-4-6",
      "providerID": "openrouter"
    }
  ]
}
```

This is the primary per-iteration cost source. The existing `extract_opencode_usage()` function in `loop.sh` already uses this.

**2. Aggregate statistics — `opencode stats`**

```bash
opencode stats              # Overall aggregate
opencode stats --models     # Per-model breakdown
opencode stats --days 7     # Last 7 days
```

Returns human-readable formatted tables. Useful for quick summaries in CLI output.

**3. SQL queries — `opencode db` (most powerful for dashboard)**

```bash
# Per-session cost aggregate
opencode db "
  SELECT session_id,
    SUM(CAST(json_extract(data,'$.tokens.input') AS INTEGER)) as input_tokens,
    SUM(CAST(json_extract(data,'$.tokens.output') AS INTEGER)) as output_tokens,
    SUM(CAST(json_extract(data,'$.cost') AS REAL)) as cost_usd
  FROM message
  WHERE json_extract(data,'$.role')='assistant'
  GROUP BY session_id
" --format json

# Cost by model over time
opencode db "
  SELECT json_extract(data,'$.modelID') as model,
    strftime('%Y-%m-%d', time_created/1000, 'unixepoch') as date,
    SUM(CAST(json_extract(data,'$.cost') AS REAL)) as cost_usd
  FROM message
  WHERE json_extract(data,'$.role')='assistant'
  GROUP BY model, date ORDER BY date DESC
" --format json

# Remaining credits (via account balance query if needed)
opencode db "
  SELECT SUM(CAST(json_extract(data,'$.cost') AS REAL)) as total_spend
  FROM message WHERE json_extract(data,'$.role')='assistant'
" --format json
```

The `opencode db` command handles all database access internally — aloop never touches the SQLite file directly.

### Dashboard Widgets

**Cost summary widget** (top bar or sidebar):
- Total spend across all sessions (from `opencode db` aggregate query)
- Budget cap from `meta.json` if configured
- Progress bar showing usage as percentage of budget cap
- Color coding: green (< 70%), yellow (70-90%), red (> 90%)
- Refreshed on session start, session end, and every 5 minutes during active loops

**Per-session cost** (session detail panel):
- Cost extracted from `iteration_complete` events in `log.jsonl` (already implemented)
- Cumulative session cost computed by summing iteration costs
- Displayed alongside existing iteration count and duration

**Cost-by-model breakdown** (analytics tab in docs panel):
- Table showing spend per model (from `opencode db` query)
- Optional time-series chart showing cumulative spend over time
- Data populated by querying `opencode db` with `--format json`

**Budget warnings:**
- Toast notification (Sonner) when cumulative cost exceeds configured thresholds
- At `budget_pause_threshold`, optionally pause loop dispatch (orchestrator mode)
- Warning thresholds are configurable:
  ```json
  {
    "budget_cap_usd": 100.00,
    "budget_warnings": [0.70, 0.85, 0.95],
    "budget_pause_threshold": 0.95
  }
  ```

### Polling Strategy

- **On session start**: query `opencode db` for current total spend, store snapshot
- **On session end**: query again, compute delta, log to `log.jsonl` as `session_cost` event
- **During active session**: aggregate from `iteration_complete` events in log (no external queries needed)
- **Dashboard refresh**: `opencode db` query every 5 minutes (configurable via `cost_poll_interval_minutes`)

### Cross-Reference

This extends **Parallel Orchestrator Mode > Provider Budget Awareness** and **Basic Token/Price Tracking** in `SPEC.md`. The per-iteration token extraction via `opencode export` remains the primary per-iteration cost data source. The `opencode db` command provides the aggregation layer for dashboard reporting.

### Acceptance Criteria

- [ ] All cost data obtained via `opencode export` or `opencode db` — no internal file access
- [ ] Cost summary widget displays cumulative spend vs budget cap with color-coded progress bar
- [ ] Per-session cost is aggregated from `iteration_complete` events in `log.jsonl`
- [ ] Cost-by-model breakdown is populated via `opencode db --format json` queries
- [ ] Budget warning toasts fire at configurable thresholds (default: 70%, 85%, 95%)
- [ ] `budget_pause_threshold` in `meta.json` pauses orchestrator dispatch when exceeded
- [ ] Missing or unavailable `opencode` CLI degrades gracefully (widget shows "unavailable", no errors)
- [ ] Session cost delta is logged to `log.jsonl` as a `session_cost` event on session end

---

## Synthetic Orchestrator Test Scenario

### Purpose

Define a reproducible end-to-end test scenario that validates the orchestrator's full lifecycle: decomposition, dependency resolution, parallel dispatch, CI gate enforcement, PR flow, merge, and resumability. This scenario uses a real codebase to exercise realistic complexity.

### Test Target

**Repository:** `/Users/pj/agent-forge` (local) — a multi-phase project with 3,879 existing tests, a multi-section spec, and multiple independent workstreams.

**Why this repo:** It has enough complexity (multiple modules, test suites, CI config) to exercise dependency resolution and parallel dispatch, but it is a known codebase where expected outcomes can be defined. Synthetic toy repos do not catch real-world integration failures.

### Safety Constraints

All test activity MUST be isolated from the target repo's production branches:

- **Branch**: all work happens on `aloop/test/<timestamp>` branches — never `main`, `master`, or `develop`
- **Issues**: all created issues are labeled `aloop/test` in addition to `aloop/auto` — enables cleanup queries
- **PRs**: all PRs target the test trunk branch (`aloop/test/<timestamp>/trunk`), never the repo's default branch
- **Cleanup**: a cleanup script (`aloop test cleanup --before <timestamp>`) deletes all test branches, closes test issues, and closes test PRs
- **No force push**: test branches follow the same no-force-push policy as production branches
- **Idempotent**: running the test scenario twice produces independent test runs (different timestamps), not conflicts

### Test Scenario Definition

**Phase 1 — Decomposition validation:**
1. Orchestrator reads a test spec (a subset of agent-forge's spec, stored at `aloop/test-fixtures/agent-forge-subset.md`)
2. Produces epic issues and sub-issues on the target repo
3. **Verify**: issue count is within expected range (5-15 sub-issues for the subset spec), dependencies form a valid DAG, wave labels are assigned, no circular dependencies

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

### Verification Script

A verification script (`aloop/test-fixtures/verify-orchestrator.sh`) automates the checks above:

```bash
aloop test orchestrator \
  --spec aloop/test-fixtures/agent-forge-subset.md \
  --target /Users/pj/agent-forge \
  --concurrency 2 \
  --timeout 30m \
  --verify-only  # just check state, don't run loops (for post-test verification)
```

The script exits 0 if all phases pass, non-zero with a summary of failures.

### Cross-Reference

This validates the orchestrator lifecycle specified in **Parallel Orchestrator Mode** in `SPEC.md`, including: shared loop mechanism, child loop sub-spec, wave scheduling, conflict resolution, resumability, and the request/response protocol.

### Acceptance Criteria

- [ ] Test spec file exists at `aloop/test-fixtures/agent-forge-subset.md`
- [ ] All test artifacts are created on `aloop/test/<timestamp>` branches, never production branches
- [ ] All test issues are labeled `aloop/test` for cleanup identification
- [ ] Decomposition produces 5-15 sub-issues from the test spec with valid DAG dependencies
- [ ] Child loops are dispatched in wave order respecting the concurrency cap
- [ ] At least one PR is created targeting the test trunk branch
- [ ] Orchestrator resumes after SIGTERM without duplicating issues, child loops, or PRs
- [ ] `aloop test cleanup --before <timestamp>` removes all test artifacts (branches, issues, PRs)
- [ ] Verification script (`verify-orchestrator.sh`) exits 0 when all phases pass

---

## OpenCode First-Class Parity

### Purpose

Ensure OpenCode is a fully supported provider with feature parity to Claude agents in the aloop ecosystem. This means proper agent YAML definitions, model/provider configuration, subagent delegation via the `task` tool, session export for cost tracking, and OpenRouter-specific features like model selection and cost-aware routing.

### Agent Definitions

Agent definitions for OpenCode live in `.opencode/agents/` in the worktree (installed by `aloop setup`). Each agent is a markdown file with YAML frontmatter:

```
.opencode/agents/
  vision-reviewer.md
  error-analyst.md
  code-critic.md
  test-writer.md
  security-scanner.md
```

This is already partially specified in **Configurable Agent Pipeline > Subagent Integration into Aloop** in `SPEC.md`. This section extends it with:

**Full agent YAML parity with Claude agents:**

| Feature | Claude (`claude/commands/`) | OpenCode (`.opencode/agents/`) |
|---------|---------------------------|-------------------------------|
| Agent definition format | Markdown with YAML frontmatter | Markdown with YAML frontmatter |
| Model selection | `model:` in frontmatter | `model:` in frontmatter (OpenRouter path) |
| Reasoning effort | `reasoning:` in frontmatter | `reasoning:` in frontmatter (passed as `--variant`) |
| Subagent delegation | `Task` tool (native) | `task` tool (native in opencode) |
| File attachment | Not supported in headless | `-f` flag on `opencode run` |
| Session export | Not available | `opencode export <sessionID>` for cost data |

### OpenCode-Specific Features

**1. Task tool for subagent delegation:**

OpenCode's `task` tool creates a child session with a specified agent. This is the primary delegation mechanism:

```
Use the task tool to delegate to the vision-reviewer agent:
task("vision-reviewer", "Analyze this screenshot for layout issues", files: ["screenshot.png"])
```

The `task` tool is available when agents are defined in `.opencode/agents/`. No additional configuration is needed.

**2. Cost tracking via public CLI:**

After each opencode iteration, cost data is extracted via:

```bash
opencode export <sessionID> | jq '{ cost: [.messages[] | select(.role=="assistant") | .cost] | add }'
```

For aggregate reporting, use `opencode db` with SQL queries (see **OpenRouter Cost Monitoring** section). Both methods use the public CLI interface — never read internal files (`auth.json`, `opencode.db`) directly.

**3. OpenRouter model selection:**

OpenCode routes through OpenRouter, supporting any model in the OpenRouter catalog. Model IDs in frontmatter use the OpenRouter path format:

```yaml
---
provider: opencode
model: openrouter/anthropic/claude-opus-4-6
reasoning: xhigh
---
```

The `openrouter/` prefix is required for models accessed via OpenRouter. Models in opencode's built-in registry can be referenced directly.

**4. Cost-aware provider routing:**

When multiple providers are configured and the round-robin selects a provider, cost should be a factor:

- For equivalent capability (e.g., two frontier models), prefer the cheaper provider
- `reasoning: medium` tasks should prefer cheaper models over expensive reasoning models
- This is a soft preference, not a hard rule — provider health and availability take priority

Configuration in `meta.json`:

```json
{
  "cost_aware_routing": true,
  "model_cost_preferences": {
    "build": "prefer_cheap",
    "review": "prefer_capable",
    "proof": "prefer_cheap"
  }
}
```

### Cross-Reference

Extends **Configurable Agent Pipeline** (agent definitions, subagent integration), **Basic Token/Price Tracking** (session export), and **Reasoning Effort Configuration** (per-phase effort mapping) in `SPEC.md`.

### Acceptance Criteria

- [ ] `.opencode/agents/` directory is created by `aloop setup` when opencode is a configured provider
- [ ] Agent markdown files have the same frontmatter schema as Claude command files (model, reasoning, provider)
- [ ] `opencode run --agent <name>` works for each shipped agent definition
- [ ] Subagent delegation via `task` tool functions in opencode build/review/proof agents
- [ ] Session cost is extracted via `opencode export`, not SQLite DB access
- [ ] OpenRouter model paths (`openrouter/<provider>/<model>`) are accepted in frontmatter `model:` field
- [ ] Cost-aware routing prefers cheaper models for `prefer_cheap` phases when capability is equivalent
- [ ] `aloop setup` installs vision-reviewer, error-analyst, and code-critic agents by default

---

## `aloop start` as Unified Entry Point

### Purpose

`aloop start` must be the single entry point for all session types. Users should not need to know whether to run `aloop start` or `aloop orchestrate` — the CLI reads the project config and dispatches accordingly. This aligns with the spec's intent that `/aloop:start` is "a thin wrapper that calls `aloop start` with the right flags" (see **UX: Dashboard, Start Flow, Auto-Monitoring** in `SPEC.md`).

### Current Problem

`start.ts` explicitly rejects `mode: orchestrate` with an error:

```
Error: Invalid mode: orchestrate (use `aloop orchestrate` for orchestrator sessions).
```

This forces users to remember which command to use based on their config — the opposite of a unified entry point.

### Required Behavior

```
aloop start              # reads project config → dispatches to loop or orchestrate
aloop start --mode loop  # explicit override → loop mode regardless of config
aloop orchestrate        # still works directly (power-user / CI shortcut)
```

**Dispatch logic in `start`:**

1. Read `mode` from project config (`~/.aloop/projects/<hash>/config.yml`)
2. If `mode === 'orchestrate'`:
   - Forward to `aloop orchestrate` with translated flags (spec files, concurrency, etc. from config)
   - Pass through any CLI overrides (`--concurrency`, `--spec`, `--trunk`, etc.)
3. If `mode` is a loop mode (`plan-build-review`, `single`, etc.):
   - Run existing loop start logic (unchanged)
4. `--mode` flag on `start` overrides the config value

**Flag mapping (`start` → `orchestrate`):**

| `aloop start` flag | `aloop orchestrate` equivalent |
|---------------------|-------------------------------|
| `--provider` | Passed through (provider selection) |
| `--max` | `--max-iterations` (but omitted by default in orchestrate mode) |
| `--in-place` | N/A (orchestrate always uses worktrees per child) |
| `--launch resume` | `--resume` (reconstruct state from GitHub) |

**Skill prompt update:** The `/aloop:start` skill prompt must not hardcode `aloop start` — it should work identically for both modes since the CLI handles dispatch.

### CLI Simplification

The current CLI exposes 15 commands. Many are internal plumbing (`resolve`, `discover`, `scaffold`) that users never call directly — `setup` and `start` call them internally. The user-facing surface should be minimal:

**User-facing commands (6):**

| Command | Purpose |
|---------|---------|
| `aloop setup` | Interactive project setup |
| `aloop start` | Start any session (loop or orchestrate — auto-dispatched from config) |
| `aloop status` | Show sessions and health |
| `aloop steer <msg>` | Send steering instruction |
| `aloop stop <id>` | Stop a session |
| `aloop dashboard` | Launch monitoring UI |

**Internal/plumbing commands (hidden from `--help` by default):**

| Command | Purpose | Called by |
|---------|---------|----------|
| `resolve` | Resolve project workspace | `setup`, `start` |
| `discover` | Discover specs and files | `setup` |
| `scaffold` | Scaffold prompts and config | `setup`, `start` |
| `orchestrate` | Orchestrator entry point | `start` (when mode=orchestrate) |
| `gh` | GitHub operations proxy | Loop runtime (requests) |
| `update` | Refresh runtime assets | Manual maintenance |
| `devcontainer` | Generate devcontainer config | `setup`, `start` |
| `active` | List active sessions | `status` (subset) |

**Key changes:**
- `orchestrate` becomes a hidden command — `start` dispatches to it automatically
- `active` is redundant with `status` — fold into `status` or hide
- `resolve`, `discover`, `scaffold` are never user-facing — hide from default `--help`
- Default `--help` shows only the 6 user-facing commands
- `aloop --help --all` or `aloop --help-all` shows everything (for debugging/development)

This does NOT change any implementation — all commands still exist and work. It only changes what's shown in `--help` and what users need to learn.

### Cross-Reference

Extends **UX: Dashboard, Start Flow, Auto-Monitoring > `aloop start` CLI subcommand** in `SPEC.md`.

### Acceptance Criteria

- [ ] `aloop start` with `mode: orchestrate` in project config launches the orchestrator (no error)
- [ ] `aloop start` with loop modes (`plan-build-review`, `single`) continues to work unchanged
- [ ] `aloop start --mode loop` overrides an `orchestrate` config to run in loop mode
- [ ] `aloop orchestrate` still works as a direct command (backwards compatible)
- [ ] `/aloop:start` skill works for both loop and orchestrate sessions without user knowing the difference
- [ ] `aloop start <session-id> --launch resume` works for both loop and orchestrate sessions
- [ ] Default `aloop --help` shows only 6 user-facing commands
- [ ] `aloop --help --all` shows all commands including internal plumbing

---

## Orchestrate Mode: No Iteration Cap

### Purpose

In orchestrate mode, child loops must not have a default `max_iterations` limit. The orchestrator manages completion through task state — when all issues are resolved and PRs merged, the orchestrator is done. An arbitrary iteration cap causes child loops to stop mid-task, leaving work incomplete and forcing manual intervention.

### Behavior by Mode

| Mode | `max_iterations` default | Rationale |
|------|--------------------------|-----------|
| `loop` | `50` (from `config.yml`) | Safety net for unattended single-agent loops |
| `orchestrate` | **None (unlimited)** | Orchestrator owns completion criteria via issue/PR state |

### Implementation

- `compile-loop-plan` must **not** inject `max_iterations` into `loop-plan.json` when the session mode is `orchestrate`
- `aloop setup` must **not** prompt for max iterations when orchestrate mode is selected
- `loop.sh` / `loop.ps1` must treat missing `max_iterations` in `loop-plan.json` as "no limit"
- The orchestrator can still stop child loops externally via `stop_child` requests when tasks are complete

### Budget Controls for Pay-Per-Use Providers

Iteration caps are not a substitute for budget controls. For pay-per-use providers (OpenRouter via OpenCode), use `budget_cap_usd` in `meta.json` instead. Subscription providers (Claude Code, Copilot, Codex, Gemini) have no per-request cost — budget caps do not apply to them.

### Cross-Reference

Affects **Parallel Orchestrator Mode** and **Configurable Agent Pipeline > Loop Plan Compilation** in `SPEC.md`.

### Acceptance Criteria

- [ ] `compile-loop-plan` omits `max_iterations` from `loop-plan.json` when mode is `orchestrate`
- [ ] `loop.sh` runs indefinitely when `max_iterations` is absent from `loop-plan.json`
- [ ] `loop.ps1` runs indefinitely when `max_iterations` is absent from `loop-plan.json`
- [ ] `aloop setup` does not prompt for max iterations in orchestrate mode
- [ ] Loop mode still defaults to `max_iterations: 50` from `config.yml`

---

## Orchestrator Must Be Fully Autonomous (Critical Fix)

### Process Diagram

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

### Problem

The orchestrator is not a daemon — it runs synchronously, exits after initialization, and requires manual `--run-scan-loop` to do anything. This is fundamentally broken. Compare:

| Behavior | `aloop start` (loop) | `aloop orchestrate` |
|----------|---------------------|---------------------|
| Spawns background process | Yes (`spawn` + `unref`) | **No** |
| Registers in `active.json` | Yes | **No** |
| Runs indefinitely | Yes (loop.sh) | **No** (exits after init) |
| Visible in dashboard | Yes | **No** |
| Stoppable via `aloop stop` | Yes | **No** |

### Required Behavior

`aloop orchestrate` must follow the same lifecycle as `aloop start`:

1. **Initialize** — create session dir, compile prompts, write `orchestrator.json`
2. **Register** — add entry to `active.json` with PID, session_dir, work_dir
3. **Spawn background daemon** — detached process running the orchestrator scan loop
4. **Return immediately** — print session info, exit CLI
5. **Daemon runs until done** — scan loop runs indefinitely until all issues complete, user stops it, or budget exhausted

The scan loop daemon:
- Runs `runOrchestratorScanPass()` every `interval` (default 30s)
- Dispatches child loops for ready issues (this already works)
- Monitors child completion, processes requests, gates PRs
- No iteration cap (per "Orchestrate Mode: No Iteration Cap" section)
- Catches SIGTERM/SIGINT for graceful shutdown
- Deregisters from `active.json` on exit

### Architecture: One Loop Instance + Runtime Coordinator

Per `SPEC.md` §Shared Loop Mechanism, the orchestrator uses the **same `loop.sh`/`loop.ps1`** as child loops — same `loop-plan.json`, same `queue/` folder, same frontmatter prompts. No new shell script complexity.

**Orchestrate mode has two processes (loop mode has one):**

In loop mode, `loop.sh` is self-contained — it writes `requests/*.json` but doesn't depend on anything processing them. The loop works standalone.

In orchestrate mode, the orchestrator's requests (`dispatch_child`, `create_issues`, `merge_pr`) **must** be processed — they are the orchestrator's only way to act on the world. So orchestrate mode requires a runtime coordinator.

**Process 1: Orchestrator loop (`loop.sh` instance)**
- Cycle: `[PROMPT_orch_scan.md]` — single scan prompt as heartbeat
- Primarily **queue-driven** — the scan checks state, but most work arrives as prompts queued by the runtime into `queue/`
- Agent writes `requests/*.json` for side effects
- No changes to `loop.sh` — it already handles iteration, provider round-robin, health, queue processing

**Process 2: Runtime coordinator (Node.js, orchestrate-mode only)**
- Watches `requests/` dir for new request files from the orchestrator loop
- Executes side effects: GitHub API (via `aloop gh`), child loop spawning, PR operations
- Queues follow-up prompts into `queue/` (e.g., after decomposition → queue refinement per epic)
- Polls: child loop completion (PID + `status.json`), GitHub state changes, spec file diffs
- Manages: concurrency cap, wave scheduling, dependency resolution, budget

**Communication:**
- `requests/*.json` — orchestrator loop → runtime (agent requests side effects)
- `queue/*.md` — runtime → orchestrator loop (runtime queues follow-up prompts)

**ETag cache persistence:**
The `EtagCache` (used for conditional GitHub API requests to avoid rate limits) must be persisted to `etag-cache.json` in the session dir. `process-requests` loads it on startup, writes it back after processing. This preserves rate-limit efficiency across invocations without requiring a long-running process.

**What `aloop orchestrate` does at startup:**
1. Initialize session dir, state file, prompts
2. Register in `active.json`
3. Spawn `loop.sh` with orchestrator `loop-plan.json` (cycle: `[PROMPT_orch_scan.md]`)
4. Return immediately — loop.sh calls `process-requests` between iterations

### Cross-Reference

Affects **Parallel Orchestrator Mode** and **Runtime Architecture** in `SPEC.md`.

### Acceptance Criteria

- [ ] `aloop orchestrate` spawns a background daemon and returns immediately
- [ ] Orchestrator registers in `active.json` (visible in `aloop status` and dashboard)
- [ ] Scan loop runs indefinitely until all issues are resolved or user stops it
- [ ] `aloop stop <orchestrator-session-id>` gracefully shuts down the orchestrator
- [ ] Dashboard displays orchestrator session with child loop status
- [ ] Child loops are dispatched automatically without manual intervention
- [ ] Orchestrator deregisters from `active.json` on exit

---

## QA Agent: Coverage-Aware Testing (Critical Fix)

### Problem

The QA agent tests randomly. It has no memory of what was tested before, no coverage tracking, no priority algorithm, and no enforcement that coverage artifacts (`QA_COVERAGE.md`, `QA_LOG.md`) are actually created. After 300+ iterations, QA may have tested the same 5 features repeatedly while leaving 80% of the spec untested.

### Root Cause

The QA prompt **instructs** the agent to maintain coverage artifacts, but:
1. No validation that artifacts exist or are updated
2. No structured format for machine parsing
3. No priority selection algorithm — "3-5 features" is arbitrary
4. No integration with the review agent (no gate checks QA results)
5. No mechanism to block loop exit when coverage is low

### Required Changes

#### A. Coverage Matrix with Structured Format

`QA_COVERAGE.md` must use a parseable format:

```markdown
# QA Coverage Matrix

<!-- AUTO-GENERATED BY QA AGENT — DO NOT EDIT MANUALLY -->
<!-- MACHINE-READABLE: each row is pipe-delimited with fixed columns -->

| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |
|---------|-----------|-------------|--------|--------|--------------|-------|
| aloop start | CLI/start.ts | 2026-03-20 | a1b2c3d | PASS | 4/5 | signal handling untested |
| dashboard health | UI/HealthPanel | 2026-03-19 | f4e5d6a | FAIL | 2/4 | codex missing |
| aloop gh watch | CLI/gh.ts | never | - | UNTESTED | 0/3 | - |
```

#### B. Priority Selection Algorithm

Update PROMPT_qa.md with explicit prioritization:

1. Parse `QA_COVERAGE.md` — extract all features with status
2. Priority order:
   - **P1:** Features with status `UNTESTED` (never tested)
   - **P2:** Features with status `FAIL` (re-test to verify fix)
   - **P3:** Features with status `PASS` but `Criteria Met` < 100% (incomplete coverage)
   - **P4:** Features with status `PASS` and oldest `Last Tested` date (stale)
3. Select top 3-5 from priority order
4. Document WHY each feature was selected in QA_LOG.md
5. **Never test a `PASS` feature if `UNTESTED` features remain** (unless it's a smoke test)

#### C. Acceptance Criteria Extraction

QA prompt must include a step to extract testable criteria from SPEC.md:

```
For each selected feature:
1. Find the acceptance criteria in SPEC.md (look for "- [ ]" checkboxes or "must"/"shall" statements)
2. Write a test plan BEFORE testing:
   - [ ] Criterion 1: exact spec text → test command/action
   - [ ] Criterion 2: exact spec text → test command/action
3. Execute each criterion, log result
4. Update QA_COVERAGE.md "Criteria Met" column (e.g., "3/5")
```

#### D. Review Gate 10: QA Trend

Add to PROMPT_review.md:

```
### Gate 10: QA Coverage & Bug Fix Rate

1. Read QA_COVERAGE.md — calculate coverage percentage (PASS+FAIL / total features)
2. If coverage < 30%: FAIL — "QA coverage critically low, prioritize QA iterations"
3. Check QA_LOG.md — are bugs from prior iteration fixed?
4. If [qa/P1] bugs outstanding for >3 iterations: FAIL — "Stale QA bugs not addressed"
5. Track trend: is coverage growing or shrinking?
```

#### E. Coverage Enforcement at Loop Exit

The finalizer's QA pass must check coverage before allowing exit:

```
Before marking allTasksMarkedDone:
1. Read QA_COVERAGE.md
2. If UNTESTED features > 30% of total: abort finalizer, file [qa/P1] task
3. If any FAIL features: abort finalizer, file [qa/P1] task for each
4. Only allow exit when: 0 FAIL, <20% UNTESTED, all P1 criteria met
```

### Cross-Reference

Extends **QA Agent — Black-Box User Testing** and **Mandatory Final Review Gate** in `SPEC.md`.

### Acceptance Criteria

- [ ] QA agent creates `QA_COVERAGE.md` on first run if missing (baseline from SPEC.md features)
- [ ] QA agent updates `QA_COVERAGE.md` after every QA iteration with structured results
- [ ] QA agent selects test targets using priority algorithm (UNTESTED > FAIL > incomplete > stale)
- [ ] QA agent documents target selection reasoning in `QA_LOG.md`
- [ ] QA agent never tests a PASS feature while UNTESTED features remain (unless smoke test)
- [ ] Review agent Gate 10 checks QA coverage percentage and bug fix rate
- [ ] Finalizer aborts if QA coverage < 70% or any FAIL features remain
- [ ] `QA_COVERAGE.md` is parseable (pipe-delimited markdown table with fixed columns)
- [ ] Dashboard displays QA coverage percentage from parsed `QA_COVERAGE.md`

---

## Orchestrator Adapter Pattern (Pluggable Issue/PR Backend)

### Purpose

The orchestrator is currently coupled to GitHub via `gh` CLI calls. All issue/PR operations must go through a pluggable adapter interface so the orchestrator can work with different backends: GitHub, local file-based (no remote needed), GitLab, Gitea, Linear, etc.

### Adapter Interface

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

### Planned Adapters

| Adapter | Backend | Use Case |
|---------|---------|----------|
| `github` | `gh` CLI | Default — real GitHub/GHE repos |
| `local` | File-based (`.aloop/issues/`) + git branches | Offline development, no remote platform needed |
| `gitlab` | `glab` CLI | GitLab repos |
| `linear` | Linear API | Linear issue tracking |

### Current State

`PrLifecycleDeps`, `DispatchDeps`, and `execGh`/`execGhIssueCreate` in `orchestrate.ts` are already dependency-injected — the adapter boundary is halfway there. The work is to:

1. Define the formal `OrchestratorAdapter` interface
2. Wrap existing `gh` CLI calls into a `GitHubAdapter` implementation
3. Add adapter selection to `aloop setup` and `meta.json` config
4. Implement `LocalAdapter` for file-based orchestration without a remote

### Approach

Don't over-abstract before a second adapter exists. Extract `execGh` calls into the typed adapter, keep GitHub as default, implement local adapter when there's demand. The interface above is the target — implement incrementally.

### Acceptance Criteria

- [ ] `OrchestratorAdapter` interface defined in `src/lib/adapter.ts`
- [ ] `GitHubAdapter` wraps all existing `gh` CLI calls
- [ ] `orchestrate.ts` uses adapter interface, not raw `execGh`
- [ ] Adapter selection configurable in `meta.json` (`adapter: "github" | "local"`)
- [ ] `LocalAdapter` stores issues as JSON files in `.aloop/issues/`, PRs as branches
- [ ] All GitHub URL construction derives from adapter, never hardcoded

---

## Scan Agent Self-Healing, Diagnostics & Alerting

### Problem

The scan agent detects blockers (missing config, unprocessed requests, stuck pipelines) and reports them in text output — but nobody reads the text, nothing gets fixed, and the loop burns iterations repeating the same observation.

### Required Capabilities

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

### `process-requests` Must Handle All Request Types

The `process-requests` command currently handles:
- `epic-decomposition-results.json` → apply decomposition
- `estimate-result-{N}.json` → apply estimates
- `sub-decomposition-result-{N}.json` → apply sub-decomposition

It must also handle request files written by agents:
- `create_issues` → create GitHub issues via `gh issue create`
- `update_issue` → update issue state/labels/body
- `close_issue` → close issue
- `dispatch_child` → spawn child loop
- `merge_pr` → merge PR after gates pass
- `post_comment` → post comment on issue/PR
- `steer_child` → write steering to child session

These are the standard request types defined in `lib/requests.ts`. The existing `processAgentRequests` function handles them — `process-requests` should call it.

### Acceptance Criteria

- [ ] Scan agent tracks blocker persistence across iterations
- [ ] After N iterations with same blocker, `diagnostics.json` is written
- [ ] Dashboard displays diagnostics as alert banner
- [ ] Known issues (missing labels, config, permissions) are self-healed
- [ ] `process-requests` calls `processAgentRequests` for standard request types
- [ ] Unhandled request types are logged with clear error messages

---

## Orchestrator Session Resumability

### Problem

Each `aloop orchestrate` invocation creates a fresh session. Previous decomposition, estimation, and GH issue creation work is lost. The orchestrator must be able to resume from an existing session.

### Required Behavior

- `aloop orchestrate --resume <session-id>` restarts the loop for an existing session
- Reads `orchestrator.json` from the existing session dir
- Does NOT re-decompose if issues already exist in state
- Does NOT re-create GH issues if `gh_number` is already set
- Detects which children are alive (PID check) and which need re-dispatch
- Resumes the scan loop from current state

### Acceptance Criteria

- [ ] `aloop orchestrate --resume <session-id>` works
- [ ] Existing issues are preserved, not re-created
- [ ] GH issues are not duplicated
- [ ] Dead children are detected and re-dispatched
- [ ] Alive children are left running

---

## Known Implementation Gaps

The following features are described in `SPEC.md` but are not yet implemented. Items are grouped by priority and cross-referenced to the relevant spec section.

### Critical

**1. Branch sync — Pre-iteration git fetch + merge not implemented**
- **Spec section**: Branch Sync & Auto-Merge (Priority: P1)
- **What's missing**: `loop.sh` and `loop.ps1` do not run `git fetch origin <base_branch>` or `git merge` before each iteration. Worktree branches drift from upstream, causing conflicts at PR time.
- **Spec requirement**: "Before every iteration, the loop script performs a base branch sync" with conflict detection and `PROMPT_merge.md` queuing.

**2. Phase prerequisites — Build/review guards missing**
- **Spec section**: Phase Advancement Only on Success (Retry-Same-Phase)
- **What's missing**: The loop does not verify that the previous phase succeeded before advancing to the next. A failing build phase can advance to review without the build passing.
- **Spec requirement**: Phase advancement requires success; failures retry the same phase or escalate per the configured ladder.

**3. Provider health file locking — Concurrent write protection incomplete**
- **Spec section**: Global Provider Health & Rate-Limit Resilience > Concurrency / File Locking
- **What's missing**: Exclusive file locking via `FileShare.None` (PowerShell) and equivalent `flock` (bash) is not implemented for health file writes. Concurrent sessions can corrupt health state.
- **Spec requirement**: "Writes: Exclusive file lock" with 5-attempt progressive backoff and graceful degradation on lock failure.

**4. UI variant exploration — Feature flag and variant creation logic missing**
- **Spec section**: Parallel Orchestrator Mode > UI Variant Exploration (Competitive Designs)
- **What's missing**: The decompose agent does not create multiple sibling sub-issues for UI features. Feature flag convention (`FEATURE_<epic>_VARIANT=A|B|C`) is not generated. `aloop setup` does not estimate or include `ui_variant_exploration` in the confirmation summary.
- **Spec requirement**: When `ui_variant_exploration: true` in `meta.json`, decompose agent creates 2-3 variant sub-issues per UI feature with distinct design directions and runtime feature flags.

### High

**5. Merge conflict resolution — No PROMPT_merge.md invocation logic**
- **Spec section**: Branch Sync & Auto-Merge > Merge Agent
- **What's missing**: Even if a merge conflict is detected, there is no logic to queue `PROMPT_merge.md` into the `queue/` folder. The merge agent prompt may not exist.
- **Spec requirement**: Conflicts emit `merge_conflict` event and queue `PROMPT_merge.md`; merge agent resolves, runs tests, commits.

**6. QA coverage tracking — QA_COVERAGE.md and QA_LOG.md not generated**
- **Spec section**: QA Agent — Black-Box User Testing (Priority: P1)
- **What's missing**: The QA agent does not produce `QA_COVERAGE.md` (coverage matrix) or `QA_LOG.md` (test run history). Coverage tracking against spec acceptance criteria is absent.
- **Spec requirement**: QA agent produces coverage artifacts mapping tested scenarios to spec acceptance criteria.

**7. Spec-gap periodic scheduling — Every 2nd cycle timing not implemented**
- **Spec section**: Spec-Gap Analysis Agent (Continuous Spec Enforcement)
- **What's missing**: The spec-gap agent is not scheduled to run before every 2nd plan phase. It may exist as a finalizer element but the periodic in-cycle scheduling (`Cycle 2: spec-gap -> plan -> ...`) is not wired up.
- **Spec requirement**: "Runs before every 2nd plan phase (i.e., every other cycle)" during normal loop execution.

**8. Triage agent — User comment classification missing**
- **Spec section**: User Feedback Triage Agent
- **What's missing**: The orchestrator does not poll issue comments, classify them (actionable, needs_clarification, question, out_of_scope), or inject steering into child loops based on user feedback.
- **Spec requirement**: Orchestrator monitor loop includes a comment triage step; actionable comments become steering; needs_clarification blocks the child loop.

**9. Command palette (Ctrl+K) — Dashboard feature not implemented**
- **Spec section**: UX: Dashboard, Start Flow, Auto-Monitoring
- **What's missing**: The `Ctrl+K` / `Cmd+K` command palette (fuzzy search for stop, force stop, switch session) is not implemented in the dashboard. The shadcn `Command` (cmdk) component is listed as a dependency but not integrated.
- **Spec requirement**: "Ctrl+K / Cmd+K — command palette (fuzzy search: stop, force stop, switch session)"

**10. Before/after comparison widget — Visual diff mode missing**
- **Spec section**: Proof-of-Work Phase
- **What's missing**: The dashboard does not provide a before/after visual comparison view for proof artifacts (screenshots). No side-by-side or overlay diff mode exists.
- **Spec requirement**: Proof phase captures screenshots; dashboard should support visual comparison for review.

### Medium

**11. Loop health supervisor — Infinite loop prevention agent missing**
- **Spec section**: Configurable Agent Pipeline > Loop health supervisor agent
- **What's missing**: `PROMPT_loop_health.md` does not exist. No agent monitors `log.jsonl` for repetitive cycling, queue thrashing, stuck cascades, or wasted iterations. No circuit breaker mechanism is implemented.
- **Spec requirement**: "A lightweight supervisor agent runs every N iterations and detects unhealthy patterns" with circuit breaker, alerting, and pipeline adjustment capabilities.

**12. Subagent hints expansion — `{{SUBAGENT_HINTS}}` planned but not implemented**
- **Spec section**: Configurable Agent Pipeline > Subagent Integration into Aloop
- **What's missing**: The `{{SUBAGENT_HINTS}}` template variable is not resolved in `loop.sh` or `loop.ps1`. Per-phase hint files (`subagent-hints-proof.md`, `subagent-hints-review.md`, `subagent-hints-build.md`) do not exist. OpenCode subagent delegation instructions are not injected into prompts.
- **Spec requirement**: "A new `{{SUBAGENT_HINTS}}` variable is populated only when the current provider supports delegation" with per-phase hint files.

**13. Domain skill discovery — tessl integration not implemented**
- **Spec section**: Domain Skill Discovery — Agent Skills / tessl (Priority: P2)
- **What's missing**: No integration with tessl for discovering domain-specific agent skills. Agent skill catalog is not queried during setup or pipeline compilation.
- **Spec requirement**: Section exists in spec as a P2 feature; integration points are defined but not built.

**14. Terminal monitoring fallback — `aloop status --watch` missing**
- **Spec section**: UX: Dashboard, Start Flow, Auto-Monitoring
- **What's missing**: `aloop status --watch` (terminal-based live monitoring with auto-refresh) is not implemented. The CLI `status` command exists but has no `--watch` mode.
- **Spec requirement**: "`aloop status --watch` provides terminal-based live monitoring (auto-refresh)" in the acceptance criteria.

**15. Dashboard `/aloop:dashboard` command and copilot prompt missing**
- **Spec section**: UX: Dashboard, Start Flow, Auto-Monitoring
- **What's missing**: The `/aloop:dashboard` Claude Code command file does not exist in `claude/commands/aloop/`. The `aloop-dashboard.prompt.md` file does not exist in `copilot/prompts/`. Agents cannot launch or interact with the dashboard via commands.
- **Spec requirement**: "`/aloop:dashboard` command file exists in `claude/commands/aloop/`" and "`aloop-dashboard.prompt.md` exists in `copilot/prompts/`" in the acceptance criteria.

---

## Orchestrator PR Review: Commit-Aware, Context-Preserving

### Problem Solved

The review agent was re-reviewing PRs every scan pass, posting 11+ duplicate comments. Reviews had no context of previous feedback.

### Required Behavior

1. **Commit SHA tracking** — store the HEAD commit SHA when a PR is reviewed. Only re-review if new commits were pushed since. Prevents review spam.

2. **Comment history in review prompt** — fetch existing PR comments and include them in the review prompt with instruction: "Do NOT repeat feedback already given. Only comment on NEW issues or acknowledge fixes."

3. **Conversation-aware review** — the agent sees the full review thread and can:
   - Acknowledge issues that were fixed since last review
   - Focus only on remaining/new issues
   - Provide a final "all clear" when everything is addressed

### Implementation

- `invokeAgentReview` checks `last_reviewed_sha` on the issue — skips if HEAD hasn't changed
- When queuing review prompt, fetches `gh pr view --json comments` and appends to prompt
- Review verdict parsed from agent output (fallback) or result file (preferred)

### Sub-Spec Handling

Child loops receive their task specification as `TASK_SPEC.md` (NOT `SPEC.md`). The project's `SPEC.md` must never be overwritten by a child loop. `TASK_SPEC.md` is gitignored and excluded from PRs.

### Acceptance Criteria

- [ ] PRs are not re-reviewed if HEAD commit hasn't changed since last review
- [ ] Review prompt includes previous PR comments with "do not repeat" instruction
- [ ] Sub-spec written to `TASK_SPEC.md`, not `SPEC.md`
- [ ] `TASK_SPEC.md` excluded from PR diffs

---

## Orchestrator Self-Healing: Failed Issue Recovery & Conflict Resolution

### Problem

`failed` was a terminal state with no recovery path. Issues that hit merge conflicts, CI failures, or transient errors were permanently stuck, consuming issue slots and requiring human intervention.

### Recovery Rules (process-requests Phase 2d.2)

Every `process-requests` pass scans `failed` issues and recovers them automatically:

| Condition | Recovery |
|-----------|----------|
| `needs_redispatch` + has open PR | → `pr_open` (lifecycle re-evaluates, dispatches child) |
| `needs_redispatch` + no PR | → `pending` (fresh dispatch) |
| Has open PR (any) | → `pr_open` (clear dead child session, reset rebase counter) |
| No PR + dead/no child | → `pending` (fresh dispatch) |
| `status === 'Done'` (scan-agent closed) | No recovery — intentionally closed |

### Merge Conflict Resolution

When a PR has merge conflicts, the orchestrator dispatches a child agent to rebase — it does NOT just post a comment. The child receives explicit instructions to `git rebase` onto the trunk branch and force-push.

- Each conflict triggers a `needs_redispatch` with rebase-specific instructions
- No hard cap on rebase attempts — each attempt dispatches a real agent
- The `rebase_attempts` counter tracks attempts for diagnostics only

### Persistent CI Failure

When the same CI failure signature persists across `ORCHESTRATOR_CI_PERSISTENCE_LIMIT` (3) attempts:

1. Close the failing PR with an explanatory comment
2. Reset the issue to `pending` with clean state (no failure counters)
3. Fresh dispatch builds from scratch on a new branch

This avoids the "failed forever" trap while preventing infinite loops on the same broken approach.

### V8 Code Cache Cleanup

Provider CLIs (claude, opencode) create V8 code cache `.so` files in `/tmp` that can fill the tmpfs (13GB+ observed).

- **Per-session** (good): child loops get `NODE_COMPILE_CACHE=<sessionDir>/.v8-cache`, cleaned on completion
- **Global** (stopgap hack): `process-requests` periodically deletes `.da*.so` files in `/tmp` older than 60 minutes — this is a blunt workaround that may delete files belonging to other processes

**Needs research** (see #164):
- Can `NODE_COMPILE_CACHE` be set for provider CLIs? They may ignore the env var or use a different caching mechanism.
- Is there a provider-specific config to disable or redirect their cache?
- Should the orchestrator use a dedicated tmpdir mount with size limits?
- Can we identify which `.so` files belong to our processes vs unrelated ones?

### Acceptance Criteria

- [ ] No issue remains in `failed` state permanently unless intentionally closed by scan agent
- [ ] Merge conflicts trigger child agent dispatch, not passive comments
- [ ] Persistent CI failures close PR and reset for fresh attempt
- [ ] `/tmp` V8 cache files are periodically cleaned
- [ ] Dead child sessions are cleared from recovered issues

---

## Loop Flag: `--no-task-exit`

The orchestrator scan loop must never auto-complete based on TODO.md task status. The `--no-task-exit` flag on `loop.sh`/`loop.ps1` disables the `check_all_tasks_complete` check entirely.

- **Child loops**: do NOT use this flag — they complete when all tasks are done (normal behavior)
- **Orchestrator loop**: ALWAYS uses this flag — completion is managed by `process-requests` (all issues merged/failed)

### Implementation
- `loop.sh`: `NO_TASK_EXIT=false` default, `--no-task-exit` sets it to true
- `check_all_tasks_complete()`: returns 1 immediately if `NO_TASK_EXIT=true`
- `orchestrate.ts`: passes `--no-task-exit` in loop.sh args

### Acceptance Criteria
- [ ] `--no-task-exit` flag accepted by loop.sh and loop.ps1
- [ ] Orchestrator loop runs indefinitely regardless of TODO.md state
- [ ] Child loops still complete normally when all tasks are done

---

## `process-requests` Phase Pipeline

`aloop process-requests` is the one-shot command called by `loop.sh` between iterations for orchestrator sessions. It executes four sequential top-level phases on each invocation. Source: `aloop/cli/src/commands/process-requests.ts` lines 110–938.

### Phase 1: Result Intake

Reads `<session>/requests/` for agent-produced result files and applies them to orchestrator state:

- **1a. Epic decomposition** (`epic-decomposition-results.json`) — applied only when `state.issues.length === 0`; calls `applyDecompositionPlan` to populate initial issue list
- **1b. Sub-decomposition** (`sub-decomposition-result-<N>.json`) — creates sub-issues in state and on GH; sets `decomposed: true` on parent; calls `updateParentTasklist` to update parent body on GH
- **1c. Refine results** (`refine-result-<N>.json`) — updates GH issue body and marks `dor_validated: true`
- **1d. Estimate results** (`estimate-result-<N>.json`) — applies wave/complexity estimates to state entries

Each result file is archived (moved out of `requests/`) after processing.

### Phase 2: GH Operations

Phase 2 is a sequence of sub-phases that operate on GH and child worktrees:

| Sub-phase | What it does |
|-----------|--------------|
| **2** | Creates GH issues for state entries with `number === 0` |
| **2b** | Forward-merges `master → agent/trunk` (picks up human changes to trunk) |
| **2c** | Rebases each `in_progress`/`pr_open` child branch onto `origin/<trunk>` (see Auto-Rebase section) |
| **2c** | Creates PRs for completed children that don't have one yet; strips working artifacts before PR |
| **2d** | Detects dead children (PID gone) and transitions state: has PR → `pr_open`; no PR → `pending` |
| **2d.2** | Recovers `failed` issues with a viable path forward (has PR → `pr_open`; no PR → `pending`) |
| **2e** | Removes worktrees and V8 cache for issues in `merged` or `failed` state |
| **2f** | Syncs changed issue statuses to GH project board via GraphQL |

### Phase 3: State Persist

Writes the mutated `OrchestratorState` to `<session>/orchestrator.json`. Also cleans stale entries from `active.json`.

### Phase 4: Scan Pass

Delegates to `runOrchestratorScanPass` (from `orchestrate.ts`) for all remaining orchestration: issue triage, child dispatch, PR lifecycle, wave advancement, budget enforcement, and child monitoring.

### Acceptance Criteria

- [ ] `grep -n "Phase 1\|Phase 2\|Phase 3\|Phase 4" aloop/cli/src/commands/process-requests.ts` returns entries for all four phases
- [ ] Phase 1 archives result files after processing (no re-processing on next invocation)
- [ ] Phase 2 sub-phases execute in the order documented above
- [ ] Phase 3 writes `orchestrator.json` before the scan pass runs

---

## Auto-Rebase Child Branches

The orchestrator automatically rebases child branches onto the trunk branch during Phase 2c of each `process-requests` invocation. Source: `aloop/cli/src/commands/process-requests.ts` lines 356–403.

### Rebase Trigger

For each issue in `in_progress` or `pr_open` state with a `child_session`:

1. `git fetch origin <trunk>` in the child worktree
2. Compute merge-base of `HEAD` and `origin/<trunk>`
3. If merge-base equals `origin/<trunk>` tip: branch is up to date — skip
4. Otherwise: branch is behind — proceed with rebase

### Pre-Rebase Commit

If the child worktree has any dirty/uncommitted files:

1. Remove working artifacts from git index (keep on disk): `git rm -f --cached` for `TODO.md`, `STEERING.md`, `QA_COVERAGE.md`, `QA_LOG.md`, `REVIEW_LOG.md`
2. Stage all remaining changes: `git add -A`
3. Commit: `chore: save work-in-progress before rebase`

### Rebase and Push

4. `git rebase origin/<trunk>` in the child worktree
5. On success: `git push origin HEAD --force-with-lease`

### Conflict Handling

On rebase conflict:

1. `git rebase --abort`
2. Write `<child-session>/queue/000-merge-conflict.md` with the content of `PROMPT_merge.md` plus explicit rebase instructions
3. The `000-` prefix guarantees the merge agent picks this up before any other queue file

### Acceptance Criteria

- [ ] `grep -n "force-with-lease\|rebase --abort\|000-merge-conflict" aloop/cli/src/commands/process-requests.ts` returns all three patterns
- [ ] Artifacts (`TODO.md`, `STEERING.md`, etc.) are removed from git index before the pre-rebase commit
- [ ] Commit message is exactly `chore: save work-in-progress before rebase`
- [ ] Conflict queue file is `000-merge-conflict.md` (not any other name)

---

## PR Lifecycle: Gate Checks, Review Verdict, Merge/Request-Changes

The PR lifecycle is managed by `processPrLifecycle` in `orchestrate.ts` (lines 3646–3896), called once per `pr_open` issue on each scan pass. Source: `aloop/cli/src/commands/orchestrate.ts`.

### Step 1: Gate Checks (`checkPrGates`)

`checkPrGates` runs two gates via `gh pr view`:

| Gate | Pass condition | Pending condition | Fail condition |
|------|---------------|-------------------|----------------|
| `merge_conflicts` | `mergeable === "MERGEABLE"` | — | Any other mergeable state |
| `ci_checks` | All checks completed and passed/neutral/skipped | Any check still running | Any check failed/cancelled/timed out |

If no check runs exist and no GitHub Actions workflows are detected, CI gate passes.

### Step 2: Pending CI

If any gate is `pending`, lifecycle returns `gates_pending` and waits for the next scan pass.

### Step 3: Merge Conflicts

If `mergeable` is false (and not an API error), the orchestrator sets `needs_rebase = true` and `needs_redispatch = true`. A child agent (with `agent: merge` frontmatter) is dispatched to resolve the conflict. `rebase_attempts` is incremented for diagnostics.

### Step 4: CI Failures

If CI gate fails:

- Tracks failure signature and retry count (`ci_failure_retries`)
- If the same CI failure signature persists for `ORCHESTRATOR_CI_PERSISTENCE_LIMIT` (3) attempts: closes the PR with a comment, resets issue to `pending`/`Ready` for fresh dispatch
- Otherwise: waits for next pass (child may self-heal)

### Step 5: Agent Review (`reviewPrDiff` / `invokeAgentReview`)

Once gates pass, runs agent review:

- **`APPROVED`**: proceeds to merge (Step 6)
- **`CHANGES_REQUESTED`**: sets `needs_redispatch = true` and `review_feedback = reviewResult.summary`; posts a comment on the PR; tracks `redispatch_failures`; after `ORCHESTRATOR_REDISPATCH_FAILURE_LIMIT` failures, sets `redispatch_paused = true` and adds `aloop/needs-human` label
- **`flag-for-human`**: calls `flagForHuman`, adds `aloop/needs-human` label

### Step 6: Squash-Merge

On `APPROVED` verdict: `gh pr merge <N> --repo <repo> --squash --delete-branch`. Issue state transitions to `merged`, status to `Done`. GH project status is synced to `Done`. Issue is closed on GH.

### Acceptance Criteria

- [ ] `grep -n "checkPrGates\|processPrLifecycle\|mergePr" aloop/cli/src/commands/orchestrate.ts` returns all three functions
- [ ] `grep "squash.*delete-branch\|delete-branch.*squash" aloop/cli/src/commands/orchestrate.ts` matches the merge command
- [ ] CI persistence limit is `ORCHESTRATOR_CI_PERSISTENCE_LIMIT` (3)
- [ ] Merge conflict → `needs_redispatch = true` (not a passive comment)

---

## Review Re-Dispatch

The orchestrator re-dispatches the child loop via `launchIssues` rather than creating a new session when a review verdict is `CHANGES_REQUESTED` or when a PR has merge conflicts. The dispatch path branches on `issue.needs_rebase`. Source: `aloop/cli/src/commands/orchestrate.ts` lines 5518–5563.

### Mechanism

1. `processPrLifecycle` sets `needs_redispatch = true` on the state issue, plus either:
   - `review_feedback = <summary>` (when verdict is `CHANGES_REQUESTED`), or
   - `needs_rebase = true` (when PR has merge conflicts with trunk)
2. On the next scan pass, `runOrchestratorScanPass` collects all issues with `needs_redispatch && !redispatch_paused`
3. Calls `launchIssues` for up to `availableSlots(state)` of them — the same dispatch path as initial child dispatch (respects concurrency limits, capability filters, state updates)
4. After launch, writes a queue file to the child's queue dir — the file chosen depends on the re-dispatch reason (see sub-sections below)

### Sub-path A: Review Feedback (`CHANGES_REQUESTED`)

When `issue.needs_rebase` is not `true`, writes `queue/000-review-fixes.md` with `agent: build` frontmatter.

`000-review-fixes.md` format:
```
---
agent: build
reasoning: high
---

# Review Feedback — Fix Required

The orchestrator review agent requested changes on PR #<N>.

## Feedback

<review_feedback content>

## Instructions

Fix the issues described above, commit, and push.
Do NOT add TODO.md, STEERING.md, TASK_SPEC.md, or other working artifacts to the commit.
```

### Sub-path B: Merge Conflict Re-Dispatch

When `issue.needs_rebase === true`, writes `queue/000-rebase-conflict.md` with `agent: merge` frontmatter instead, and clears `needs_rebase = false` after launch.

`000-rebase-conflict.md` format:
```
---
agent: merge
reasoning: high
---

# Rebase Required

PR #<N> has merge conflicts with `<trunk_branch>`.

Run:

    git fetch origin <trunk_branch>
    git rebase origin/<trunk_branch>

Resolve all conflict markers, then:

    git rebase --continue
    git push origin HEAD --force-with-lease
```

### State Cleanup

After launch, `needs_redispatch` is set to `false` and `review_feedback` is cleared from the state issue. When `needs_rebase === true`, `needs_rebase` is additionally set to `false`.

### Acceptance Criteria

- [ ] `grep -n "000-review-fixes.md" aloop/cli/src/commands/orchestrate.ts` returns the queue file write
- [ ] `grep -n "000-rebase-conflict" aloop/cli/src/commands/orchestrate.ts` returns the merge-conflict queue file write
- [ ] `grep -n "needs_redispatch.*false\|needs_redispatch = false" aloop/cli/src/commands/orchestrate.ts` confirms state cleanup
- [ ] `grep -n "needs_rebase.*false\|needs_rebase = false" aloop/cli/src/commands/orchestrate.ts` confirms `needs_rebase` cleared after merge dispatch
- [ ] Re-dispatch uses `launchIssues` (not a new `orchestrate` session)
- [ ] Queue file name is `000-review-fixes.md` for `CHANGES_REQUESTED`; `000-rebase-conflict.md` for merge conflicts

---

## Cleanup: Worktree Removal and V8 Cache Management

Post-completion cleanup runs during Phase 2e of each `process-requests` invocation. Source: `aloop/cli/src/commands/process-requests.ts` lines 574–609.

### Per-Session Cleanup (Phase 2e)

For every issue in `merged` or `failed` state that still has a `child_session`:

1. If `<child-session>/worktree` exists: `git worktree remove --force <worktree-path>` (run in `projectRoot`), then `git worktree prune`
2. If `<child-session>/.v8-cache` exists: `rm -rf <child-session>/.v8-cache`

Cleanup is best-effort — errors are silently ignored.

### Global /tmp Cleanup (Periodic Hack)

With 10% probability on each `process-requests` invocation, runs:

```
find /tmp -maxdepth 2 -name '.da*.so' -mmin +60 -delete
```

This removes V8 code cache `.so` files created by provider CLIs (claude, opencode) that accumulate in `/tmp`. This is a blunt workaround — it may affect files from unrelated processes. Per-session cache is handled cleanly via `NODE_COMPILE_CACHE=<sessionDir>/.v8-cache`.

### Acceptance Criteria

- [ ] `grep -n "worktree remove --force\|worktree prune\|\.v8-cache" aloop/cli/src/commands/process-requests.ts` returns all three patterns
- [ ] Cleanup triggers only for `merged` or `failed` issues with a `child_session`
- [ ] Global `/tmp` cleanup runs with ~10% probability (not every pass)

---

## Epic Lifecycle: Tracking State, Sub-Issue Tasklists, Parent References

Issues labeled `aloop/epic` follow a distinct lifecycle from regular issues. Source: `aloop/cli/src/commands/orchestrate.ts` lines 1148–1188; `aloop/cli/src/commands/process-requests.ts` lines 186–214.

### Epics Are Never Dispatched

Epics are tracking issues only. On GH project status preload (restart), if an issue is labeled `aloop/epic`, it is never assigned `issueState = 'in_progress'` regardless of project status. Only non-epics get child sessions.

### Tasklist Epics

An epic is considered a "tasklist epic" if its body contains `[tasklist]`. These have `hasSubIssues = true` and are assigned `status = 'In progress'` (not `'Needs decomposition'`). They are tracking the completion of their sub-issues via the tasklist.

### Sub-Issue Creation

When a sub-decomposition result is applied:

1. Each sub-issue body is prefixed: `Part of #<parentNum>: <parentTitle>\n\n<sub body>`
2. Sub-issue is created on GH with label `aloop/auto`
3. Sub-issue state entry gets `wave`, `depends_on`, and other fields from the decomposition result
4. Parent issue gets `decomposed: true` set on its state entry
5. Parent body on GH is updated with a markdown tasklist via `updateParentTasklist`

### Parent Reference

Sub-issues store the parent issue number implicitly in their body prefix (`Part of #<N>:`). There is no separate `parent_issue` field on the state entry — the relationship is expressed in the body.

### Acceptance Criteria

- [ ] `grep -n "aloop/epic\|isEpic\|hasSubIssues" aloop/cli/src/commands/orchestrate.ts` returns epic detection logic
- [ ] `grep -n "Part of #\|updateParentTasklist\|decomposed.*true" aloop/cli/src/commands/process-requests.ts` returns all three patterns
- [ ] Epics with `isEpic = true` never get `issueState = 'in_progress'` in the preload path

---

## GH Project Status Preloading on Restart

On orchestrator restart (when `state.issues.length === 0` but GH issues exist), the orchestrator fetches GH project status for all issues in a single batch before populating local state. Source: `aloop/cli/src/commands/orchestrate.ts` lines 1118–1193.

### Mechanism

1. Fetches the aloop project number dynamically via `gh project list --owner <owner>`
2. Runs a single GraphQL query to get all project items with their `Status` field values into a `projectStatusMap`
3. For each GH issue, looks up the project status and applies it:

| Project status | `dor_validated` | `issueState` |
|----------------|-----------------|--------------|
| `Ready` | `true` | `pending` |
| `In progress` (non-epic) | `true` | `in_progress` |
| `In review` | `true` | `pr_open` |
| `Done` | `true` | `merged` |
| (absent) | `false` | `pending` |

### Purpose

Avoids re-triggering estimation/refinement for issues that were already processed in a prior session. Issues at `Ready`, `In review`, or `Done` skip the `Needs refinement` status that would queue a refinement agent.

### Acceptance Criteria

- [ ] `grep -n "projectStatusMap\|gh_project_number\|projectV2" aloop/cli/src/commands/orchestrate.ts` returns the preload logic
- [ ] Preload only runs when `state.issues.length === 0` (not on every scan pass)
- [ ] Project status `Done` maps to `issueState = 'merged'` (not re-dispatched)

---

## Queue Priority: `000-` Prefix

Queue files in `<child-session>/queue/` are processed in lexicographic sort order. Files prefixed with `000-` sort before all others and are therefore processed first. Source: `aloop/cli/src/commands/process-requests.ts` and `aloop/cli/src/commands/orchestrate.ts` throughout.

### Reserved `000-` Queue Files

| File | Written by | Purpose |
|------|------------|---------|
| `000-merge-conflict.md` | `process-requests.ts` Phase 2c | Triggers merge agent on rebase conflict |
| `000-review-fixes.md` | `orchestrate.ts` re-dispatch path | Delivers review feedback to child loop |
| `000-extract-verdict-<pr>.md` | `orchestrate.ts` | Triggers verdict extraction for stuck reviews |
| `000-review-<pr>.md` | `process-requests.ts` invokeAgentReview | Triggers review agent for a PR |
| `000-troubleshoot-review-<pr>.md` | `process-requests.ts` invokeAgentReview | Triggers troubleshoot agent when review is stuck |

### Convention

- Normal queue files use descriptive names without a numeric prefix, or with a higher prefix (e.g., `001-`)
- `000-` is reserved for high-priority injected prompts that must be picked up before any other work
- The child loop does not need any special logic — lexicographic ordering handles priority automatically

### Acceptance Criteria

- [ ] `grep -rn "000-merge-conflict\|000-review-fixes\|000-review-\|000-troubleshoot-review\|000-extract-verdict" aloop/cli/src/commands/` returns all `000-` file names
- [ ] No `000-` file is written by child agents (only by the orchestrator runtime)

---

## Artifact Management: Working Files Excluded from PRs

Five working artifact files must not appear in PRs or rebase operations. They are temporarily removed from the git index before these operations but kept on disk. Source: `aloop/cli/src/commands/process-requests.ts` lines 375–383 (pre-rebase), 423–431 (pre-PR).

### Artifact List

- `TODO.md`
- `STEERING.md`
- `QA_COVERAGE.md`
- `QA_LOG.md`
- `REVIEW_LOG.md`

### Pre-Rebase Removal

Before committing the pre-rebase WIP snapshot, each artifact is removed from the git index (not disk):

```bash
git rm -f --cached <artifact>   # in child worktree
```

This prevents the WIP commit from including artifact files and prevents rebase conflicts on them.

### Pre-PR Removal

Before creating a PR, each artifact is removed from the git index:

```bash
git rm --cached --ignore-unmatch <artifact>   # in child worktree
```

If any files were staged by this removal, a commit is made: `chore: remove working artifacts from PR`. The branch is then pushed before the PR is created.

### Why Not `.gitignore`

The artifacts are files the child loop actively writes during its session. They are not ignored globally — they are selectively excluded from specific git operations by the orchestrator runtime.

### Acceptance Criteria

- [ ] `grep -n "TODO.md.*STEERING.md\|working artifacts" aloop/cli/src/commands/process-requests.ts` returns both removal sites
- [ ] Artifact removal uses `--cached` (not `--` or full delete)
- [ ] Pre-PR commit message is exactly `chore: remove working artifacts from PR`
- [ ] Files remain on disk after removal from index

---

## `execGh` Calls `gh` Directly

The `execGh` helper in both `process-requests.ts` and `orchestrate.ts` calls the `gh` CLI binary directly via `spawnSync`. It does NOT call `aloop gh`. Source: `aloop/cli/src/commands/process-requests.ts` lines 141–145.

### Implementation

```typescript
const execGh = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
  const r = spawnSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 30000 });
  if (r.status === null && r.signal) throw new Error(`gh timed out (${r.signal})`);
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
```

### Why Not `aloop gh`

`aloop gh` is a wrapper command for agents running inside child loops that do not have direct `gh` access (Constitution rule 4: agents cannot call external CLIs directly). The orchestrator runtime (`process-requests`, `orchestrate`) runs on the host with direct `gh` access and calls it directly. Using `aloop gh` from within the runtime would be unnecessary indirection and would break if the CLI is not installed or not in `PATH`.

### Acceptance Criteria

- [ ] `grep -n "spawnSync.*'gh'" aloop/cli/src/commands/process-requests.ts` returns the `execGh` definition
- [ ] `grep -n "aloop gh\|execAloop.*gh" aloop/cli/src/commands/process-requests.ts` returns no matches
- [ ] Same pattern holds in `aloop/cli/src/commands/orchestrate.ts`

## master ↔ agent/trunk Sync Strategy

### Two-Branch Model

The orchestrator operates with two long-lived branches:

- **`master`** — the human development branch; humans commit directly here
- **`agent/trunk`** — the agent integration branch; child PRs target this branch; the orchestrator merges into it

These two branches diverge independently and must be kept in sync.

### Four Sync Operations

| # | Operation | Direction | Where | Trigger |
|---|-----------|-----------|-------|---------|
| 1 | Child branch-from-trunk | `agent/trunk` → child branch | `orchestrate.ts` `launchChildLoop` | New child session dispatched |
| 2 | PR merge into trunk | child branch → `agent/trunk` | `orchestrate.ts` `mergePr` | PR approved and gates pass |
| 3 | Forward-merge master into trunk | `master` → `agent/trunk` | `process-requests.ts` `syncMasterToTrunk` (Phase 2b) | Each `process-requests` run |
| 4 | Trunk-to-master PR | `agent/trunk` → `master` | `orchestrate.ts` `createTrunkToMainPr` | All issues resolved, `auto_merge_to_main` enabled |

### Phase 2b: `syncMasterToTrunk` Logic

Runs every `process-requests` cycle. Three cases:

1. **Fast-forward** (`merge-base ≠ master HEAD`, FF push succeeds): `origin/master` is a linear descendant of `origin/<trunk>`. Runs `git push origin origin/master:refs/heads/<trunk>` — a standard (non-force) push that fails if non-FF.

2. **Diverged** (`merge-base ≠ master HEAD`, FF push fails): Both branches have independent commits. Creates a temporary worktree checked out at `<trunk>`, runs `git merge origin/master --no-edit`, then pushes. Removes the worktree regardless of outcome.

3. **No-op** (`merge-base == master HEAD`): Trunk already contains all of master's commits. Nothing to do.

### No-Force-Push Invariant

**`git push --force` and `git push --force-with-lease` are never used on `agent/trunk`.** The fast-forward push is a plain refspec push that naturally rejects non-FF updates; the diverged path creates a real merge commit and pushes it conventionally. This invariant must be preserved in all future modifications to `syncMasterToTrunk`.
