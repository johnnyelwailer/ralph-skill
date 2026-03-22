# Issue #107 Implementation Plan

## In Progress

(none)

## Completed

- [x] `opencode run --agent <name>` documented for shipped agents — README section with agent table and example invocations, post-scaffold message in `setup.ts` and `scaffold.ts` listing agents when OpenCode enabled

- [x] [review] Gate 1: `aloop/agents/opencode/code-critic.md` reasoning fixed to `xhigh` per spec (commit `625d6c2`)
- [x] [qa/P1] `start --max-iterations 0` now throws validation error instead of silently defaulting (commit `c22031b`) — code-reviewed: `toPositiveInt()` rejects 0, `hasConfiguredValue` guard throws on invalid input
- [x] Cost routing preference stored and used per phase — `cost_routing` schema/defaults in config, parsed/merged in `start.ts`, per-phase OpenRouter model selection in `compile-loop-plan.ts` with tests (commit `bf489ad`)
- [x] `.opencode/agents/` created with shipped agents by setup when OpenCode configured
- [x] Agent frontmatter includes model, reasoning, provider fields — verified all 3 agents (code-critic, error-analyst, vision-reviewer)
- [x] OpenRouter model paths (`openrouter/anthropic/claude-sonnet-4.6`) accepted in config and validated in `start` (commit `01f62e2`)
- [x] Status shows OpenCode cost data when available — `CostDisplay.tsx`, `useCost.ts` hook, `/api/cost/aggregate` endpoint all implemented with graceful degradation
- [x] Bundle opencode agents for setup scaffolding (commit `1dc2053`)
