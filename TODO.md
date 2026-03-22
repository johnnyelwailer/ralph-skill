# TODO

## Current Phase: QA Bug Fixes

### In Progress

- [x] [qa/P1] Fix `/api/cost/aggregate` SQL query — wrong table name causes all cost features to fail (priority: critical)
  - **Root cause:** `dashboard.ts:1133` queries `SELECT model, SUM(cost_usd) as cost_usd FROM usage GROUP BY model` but opencode's DB has no `usage` table. The spec (SPEC-ADDENDUM §OpenRouter Cost Monitoring) says the correct query is against the `message` table using `json_extract(data,'$.cost')` and filtering `json_extract(data,'$.role')='assistant'`. The query should be: `SELECT json_extract(data,'$.modelID') as model, SUM(CAST(json_extract(data,'$.cost') AS REAL)) as cost_usd FROM message WHERE json_extract(data,'$.role')='assistant' GROUP BY model`
  - **Cascading fix:** This also fixes bug #3 (no spend-vs-cap display) since the API returning `opencode_unavailable` forces the widget into the error path showing "Cost data unavailable" instead of `$X.XX / $Y.YY`
  - Files: `aloop/cli/src/commands/dashboard.ts` (line 1133)
  - Tests: `aloop/cli/src/commands/dashboard.test.ts` — update mock expectations for new query format

- [x] [qa/P1] Fix progress bar showing yellow at 0% spend (priority: high)
  - **Observed:** QA saw yellow `rgb(234, 179, 8)` indicator at 0% budget used. The `indicatorClass()` function in `CostDisplay.tsx` correctly returns `bg-emerald-500` for percent < 70, so the color logic itself is sound. The issue likely surfaces during the initial loading/transition state or is a CSS specificity problem where `bg-yellow-500` from another context leaks through Tailwind's `cn()` merge. Investigate: (1) does the Radix Progress indicator show a visible strip at value=0 due to subpixel rendering, (2) is `indicatorClassName` being overridden by base styles, (3) could this be the header task progress bar (`phaseBarColor`) being mistaken for the cost bar.
  - Files: `aloop/cli/dashboard/src/components/progress/CostDisplay.tsx`, `aloop/cli/dashboard/src/components/ui/progress.tsx`
  - Tests: Add a test verifying `indicatorClass(0)` returns green and that at 0% the progress bar either renders green or is hidden

### Up Next

### Spec-Gap Analysis (2026-03-22)

All TASK_SPEC.md acceptance criteria for issue #117 are fulfilled. The following gaps are against the broader SPEC-ADDENDUM acceptance criteria and are **out of scope** for issue #117 (separate issues should be filed):

- [ ] [spec-gap/P2] `runOpencodeDb()` missing `--format json` flag — SPEC-ADDENDUM §OpenRouter Cost Monitoring shows all `opencode db` queries using `--format json`, but `dashboard.ts:575` invokes `opencode db --query <sql>` without the flag. The code parses stdout as JSON, so it works only if `opencode db` defaults to JSON output. If the default changes, cost queries will break silently.
  - Spec: SPEC-ADDENDUM line 301, 311, 317 (`--format json`)
  - Code: `aloop/cli/src/commands/dashboard.ts:575` (`runOpencodeDb` function)
  - Fix: Add `'--format', 'json'` to the `spawnSync` args array

- [ ] [spec-gap/P3] Cost-by-model breakdown UI not implemented — SPEC-ADDENDUM §Dashboard Widgets specifies a "Cost-by-model breakdown (analytics tab in docs panel)" with table and optional time-series chart. The `/api/cost/aggregate` endpoint returns `by_model` data, but no UI component consumes or displays it. **Out of scope for issue #117** — the TASK_SPEC only covers the summary widget.
  - Spec: SPEC-ADDENDUM lines 336-339
  - Code: API returns data at `dashboard.ts:1142`, no corresponding UI component
  - Fix: File a new issue for the analytics tab

- [ ] [spec-gap/P3] Budget warning toast notifications not implemented — SPEC-ADDENDUM §Budget Warnings specifies Sonner toast notifications at configurable thresholds (70%, 85%, 95%). The `CostDisplay` component accepts `budgetWarnings` and displays them as static text, but no toasts are triggered. **Out of scope for issue #117.**
  - Spec: SPEC-ADDENDUM lines 341-351
  - Code: `CostDisplay.tsx:72-74` (static text only), Sonner is imported in AppView.tsx but not used for cost alerts
  - Fix: File a new issue for budget warning toasts

- [ ] [spec-gap/P3] `budget_pause_threshold` does not pause orchestrator dispatch — SPEC-ADDENDUM says this threshold should "optionally pause loop dispatch (orchestrator mode)". The value is read from `meta.json` and displayed in the widget, but no orchestrator dispatch logic checks it. **Out of scope for issue #117.**
  - Spec: SPEC-ADDENDUM lines 343, 371
  - Code: Read in `AppView.tsx:2218-2227`, displayed in `CostDisplay.tsx:90`, not used in orchestrator
  - Fix: File a new issue for orchestrator budget gating

- [ ] [spec-gap/P3] `session_cost` event not logged to `log.jsonl` on session end — SPEC-ADDENDUM says "On session end: query again, compute delta, log to `log.jsonl` as `session_cost` event". Neither `loop.sh` nor `loop.ps1` emit this event. **Out of scope for issue #117.**
  - Spec: SPEC-ADDENDUM lines 357, 373
  - Code: No occurrences of `session_cost` in loop.sh or loop.ps1
  - Fix: File a new issue for session cost delta logging

### Completed

- [x] [qa/P1] Fix `/api/cost/aggregate` SQL query — changed from nonexistent `usage` table to correct `message` table with `json_extract` per SPEC-ADDENDUM
- [x] Rebuild dashboard dist after bug fixes — rebuilt with `npm run build`; updated `aloop/cli/dist/dashboard/index.html` asset references to current dashboard bundle

### Notes

- Bugs #2 and #3 from QA share the same root cause (wrong SQL table name). Fixing the query in `dashboard.ts:1133` resolves both.
- The `CostDisplay` component rendering logic and `useCost` hook design are correct — they work as specified once the API returns valid data.
- The `opencode db` CLI interface exists and works (QA confirmed `opencode db` was functional with v1.2.25); only the SQL query is wrong.
