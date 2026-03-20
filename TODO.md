# Project TODO

This file is read by **loop mode** agents (plan/build/qa/review). Orchestrator work is tracked in SPEC.md + SPEC-ADDENDUM.md and GitHub issues.

## Up Next

### Loop Runtime
- [ ] [runtime/P1] Branch sync & auto-merge — pre-iteration `git fetch + merge` from base branch, merge conflict detection → queue `PROMPT_merge.md`, orchestrator trunk↔feature sync. Both `loop.sh` and `loop.ps1`. (priority: high)
- [ ] [runtime/P1] Extract runtime from dashboard — move trigger resolution, steering detection, stuck detection from `monitor.ts` into shared `runtime.ts` base library. Dashboard and orchestrator both import runtime. Dashboard becomes pure observability. (priority: high)
- [ ] [runtime/P1] Phase prerequisites — build phase requires unchecked TODO.md tasks, review phase requires commits since plan. MAX_PHASE_RETRIES = len(providers) * 2 before forced advance. (priority: high)
- [ ] [runtime/P1] Provider health file locking — implement file locking with 5-attempt retry and exponential backoff for concurrent write protection. (priority: high)
- [ ] [loop/P1] Finalizer in loop.ps1 — parity with loop.sh finalizer implementation. (priority: high)
- [ ] [loop/P1] Finalizer in compile-loop-plan.ts — compile `finalizer:` from pipeline.yml into loop-plan.json `finalizer[]` array + `finalizerPosition`. (priority: high)
- [ ] [loop/P1] Merge conflict resolution — implement PROMPT_merge.md invocation when pre-iteration merge detects conflicts, emit merge_conflict event. (priority: high)

### Dashboard
- [ ] [dashboard/P1] Orchestrator logs missing agent CLI output — show actual agent response text, tool calls, and file writes per iteration (parity with normal loop). (priority: high)
- [ ] [dashboard/P1] Orchestrator artifacts viewable — epics, estimation results, decomposition plans in Documents tab or Artifacts tab. (priority: high)
- [ ] [dashboard/P1] Storybook integration — add @storybook/react-vite, stories alongside components as *.stories.tsx. (priority: high)
- [ ] [dashboard/P1] Responsiveness — mobile/tablet/desktop breakpoints (640/1024px), collapsible sidebar, stacked panels. (priority: high)
- [ ] [dashboard/P2] Stale sessions showing as active — check PID liveness, move dead to "recent". (priority: medium)
- [ ] [dashboard/P2] GitHub issues in sidebar tree — session → epics → sub-issues with clickable links. (priority: medium)
- [ ] [dashboard/P2] GitHub issue links — clickable links in log entries and state (GHE-safe). (priority: medium)
- [ ] [dashboard/P2] Command palette — Ctrl+K/Cmd+K with cmdk. (priority: medium)
- [ ] [dashboard/P2] Before/after comparison widget — side-by-side, slider, diff overlay for proof artifacts. (priority: medium)

### CLI
- [ ] [cli/P1] Dashboard stale asset bug — install paths must clean old dashboard dirs before copying. (priority: high)
- [ ] [cli/P1] `aloop start` should dispatch to orchestrator when config has `mode: orchestrate`. (priority: high)

### Agent Quality
- [ ] [opencode/P1] First-class OpenCode parity — agent YAML parity, OpenRouter model selection, reasoning effort per phase, cost-aware routing. (priority: high)
- [ ] [cost/P1] OpenRouter cost monitoring via opencode CLI — surface in dashboard. (priority: high)

### Low Priority
- [ ] [runtime/P2] Subagent hints expansion — `{{SUBAGENT_HINTS}}` template variable in loop.sh/loop.ps1. (priority: low)
- [ ] [cli/P2] Missing commands — /aloop:dashboard command file and copilot prompt. (priority: low)
- [ ] [loop/P2] Domain skill discovery — tessl init integration. (priority: low)
