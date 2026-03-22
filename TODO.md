# Issue #107 Implementation Plan

## In Progress

- [x] [review] Gate 1: `aloop/agents/opencode/code-critic.md` has `reasoning: high` but spec line 3500 says code-critic uses "xhigh effort" — change to `reasoning: xhigh` in both `aloop/agents/opencode/code-critic.md` and `.opencode/agents/code-critic.md` (priority: high)
- [ ] [qa/P1] `start --max-iterations 0` silently ignored: `toPositiveInt()` in `start.ts:291-297` returns null for 0, falling back to default 50. Should either accept 0 (for orchestrate mode unlimited) or emit a validation error (priority: high)

## Up Next

- [ ] Cost routing preference stored and used per phase — no `cost_routing` config exists yet; needs schema in `config.yml`, per-phase routing logic in `compile-loop-plan.ts`
- [ ] `opencode run --agent <name>` documented for shipped agents — mentioned in SPEC but needs user-facing docs/help text

## Completed

- [x] `.opencode/agents/` created with shipped agents by setup when OpenCode configured
- [x] Agent frontmatter includes model, reasoning, provider fields — verified all 3 agents (code-critic, error-analyst, vision-reviewer) have model, reasoning, provider in frontmatter
- [x] OpenRouter model paths (`openrouter/anthropic/claude-sonnet-4.6`) accepted in config and validated in `start`
- [x] Status shows OpenCode cost data when available — `CostDisplay.tsx`, `useCost.ts` hook, `/api/cost/aggregate` endpoint all implemented with graceful degradation
