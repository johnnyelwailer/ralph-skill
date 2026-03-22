# Sub-Spec: Issue #107 — OpenCode first-class parity — agent scaffolding & cost-aware routing

## Objective

Make OpenCode a first-class provider with agent scaffolding during setup, OpenRouter model path support, and cost-aware routing configuration.

## Scope

### Agent Scaffolding in Setup
- When provider includes `opencode`, `aloop setup` creates/updates `.opencode/agents/` directory
- Ships three reference agents: `vision-reviewer.md`, `error-analyst.md`, `code-critic.md`
- Agent markdown files use frontmatter schema: `model`, `reasoning`, `provider`
- `aloop scaffold` also handles `.opencode/agents/` creation
- Template agents stored in aloop runtime assets, copied during scaffold

### OpenRouter Model Paths
- Accept `openrouter/<provider>/<model>` format in agent frontmatter and config
- Examples: `openrouter/anthropic/claude-sonnet-4.6`, `openrouter/google/gemini-3.1-pro`
- Validate model path format (must have 3 segments when openrouter prefix)
- Store in project config under `models.opencode` or agent-level overrides

### Cost-Aware Routing
- Per-phase routing preference: `prefer_cheap` or `prefer_capable`
- Default: plan/review phases → `prefer_capable`, build phase → `prefer_cheap`
- Stored in project config under `cost_routing` key
- Used by loop plan compilation to select model per phase
- OpenRouter-specific: maps to model selection from `openrouter_models` list

### OpenCode Export Integration
- Cost tracking via `opencode export` command (not SQLite)
- Document how costs are aggregated per session
- Status command shows OpenCode costs when available

## Files
- `aloop/cli/src/commands/setup.ts` — OpenCode detection and agent scaffolding trigger
- `aloop/cli/src/commands/scaffold.ts` — `.opencode/agents/` directory creation and template copying
- `.opencode/agents/*.md` — reference agent templates (already exist, may need frontmatter updates)
- `aloop/cli/src/commands/start.ts` — OpenRouter model path validation
- `aloop/cli/src/commands/compile-loop-plan.ts` — cost-aware model selection per phase
- `aloop/config.yml` — add `cost_routing` schema

## Acceptance Criteria
- [ ] `.opencode/agents/` created with shipped agents by setup when OpenCode configured
- [ ] Agent frontmatter includes model, reasoning, provider fields
- [ ] OpenRouter model paths (`openrouter/anthropic/claude-sonnet-4.6`) accepted in config
- [ ] Cost routing preference stored and used per phase
- [ ] `opencode run --agent <name>` documented for shipped agents
- [ ] Status shows OpenCode cost data when available

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
