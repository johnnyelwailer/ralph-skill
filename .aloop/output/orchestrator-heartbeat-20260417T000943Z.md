# Orchestrator Heartbeat — 2026-04-17T00:09:43Z

## Session State (orchestrator-20260416-222928)

- Iteration: 500 (approx)
- Issues loaded: **11 epics**, all `state: pending`, `status: "Needs decomposition"`
- Concurrency cap: 3 / autonomy: balanced / plan_only: false
- Queue: **empty**
- Active child sessions: **none**

## Old Orchestrator (orchestrator-20260321-172932)

- Status: **still running** — iter 534, phase `orch_scan`
- This is SEPARATE from the new session; operates independently

## New Session Status

All 11 epics were ingested into orchestrator.json at `2026-04-17T00:06:35Z` (process-requests ran successfully after last heartbeat fixed the JSON parse error).

| Wave | Issue | Title | Status | Deps |
|------|-------|-------|--------|------|
| 1 | #1 | Loop Engine Core | Needs decomposition | none |
| 2 | #2 | Provider Health | Needs decomposition | #1 |
| 2 | #3 | Agent Pipeline & Runtime | Needs decomposition | #1 |
| 3 | #4 | Loop Quality Agents | Needs decomposition | #1, #3 |
| 3 | #5 | Dashboard Refactor | Needs decomposition | #1, #2, #3 |
| 3 | #7 | Branch Sync & Merge | Needs decomposition | #1, #3 |
| 3 | #8 | Security Model & aloop gh | Needs decomposition | #1, #3 |
| 4 | #6 | Dashboard UX & aloop start | Needs decomposition | #3, #5 |
| 4 | #9 | Parallel Orchestrator Mode | Needs decomposition | #1, #3, #7, #8 |
| 5 | #10 | Devcontainer Support | Needs decomposition | #1, #3, #6 |
| 5 | #11 | Domain Skills & Cost | Needs decomposition | #6, #9 |

## Gap Identified: Missing `sub_decompose` Event in pipeline.yml

The current `pipeline.yml` `orchestrator_events` defines:
- `refine`: for issues at `status: "Needs refinement"` + `refined: false`
- `estimate`: for issues at `status: "Needs refinement"` + `refined: true`
- `cr_analysis`: for change request issues

**Missing**: no event for `status: "Needs decomposition"` → triggers `PROMPT_orch_sub_decompose.md` to break each epic into child-loop-sized work units.

The `PROMPT_orch_sub_decompose.md` template exists in `aloop/templates/` but has no pipeline trigger.

## Recommended Actions

### Option A — Add sub_decompose event to pipeline.yml (preferred)

Add to `orchestrator_events` in `pipeline.yml`:

```yaml
sub_decompose:
  prompt: PROMPT_orch_sub_decompose.md
  batch: 1
  filter:
    status: "Needs decomposition"
  result_pattern: "sub-decompose-result-{issue_number}.json"
```

This would let `process-requests` queue sub-decompose for issue #1 (wave 1, no unresolved deps) on the next scan.

### Option B — Human queues sub-decompose manually

Queue `PROMPT_orch_sub_decompose.md` with issue #1 context into the session queue dir:
`/home/pj/.aloop/sessions/orchestrator-20260416-222928/queue/`

## Summary

| Item | Status |
|------|--------|
| Epic ingestion | DONE — 11 epics in orchestrator.json |
| Active child loops | 0 |
| Queue overrides | Empty |
| Sub-decompose pipeline gap | Needs resolution (Option A or B above) |
| Issue #1 readiness | Ready for sub-decomposition (wave 1, no deps) |
| Old orchestrator (172932) | Running at iter 534 — separate session |
