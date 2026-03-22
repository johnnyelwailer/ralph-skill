# TODO

## Current Phase: QA Bug Fixes

### In Progress

- [x] [qa/P1] Fix `/api/cost/aggregate` SQL query — wrong table name causes all cost features to fail (priority: critical)
  - **Root cause:** `dashboard.ts:1133` queries `SELECT model, SUM(cost_usd) as cost_usd FROM usage GROUP BY model` but opencode's DB has no `usage` table. The spec (SPEC-ADDENDUM §OpenRouter Cost Monitoring) says the correct query is against the `message` table using `json_extract(data,'$.cost')` and filtering `json_extract(data,'$.role')='assistant'`. The query should be: `SELECT json_extract(data,'$.modelID') as model, SUM(CAST(json_extract(data,'$.cost') AS REAL)) as cost_usd FROM message WHERE json_extract(data,'$.role')='assistant' GROUP BY model`
  - **Cascading fix:** This also fixes bug #3 (no spend-vs-cap display) since the API returning `opencode_unavailable` forces the widget into the error path showing "Cost data unavailable" instead of `$X.XX / $Y.YY`
  - Files: `aloop/cli/src/commands/dashboard.ts` (line 1133)
  - Tests: `aloop/cli/src/commands/dashboard.test.ts` — update mock expectations for new query format

- [ ] [qa/P1] Fix progress bar showing yellow at 0% spend (priority: high)
  - **Observed:** QA saw yellow `rgb(234, 179, 8)` indicator at 0% budget used. The `indicatorClass()` function in `CostDisplay.tsx` correctly returns `bg-emerald-500` for percent < 70, so the color logic itself is sound. The issue likely surfaces during the initial loading/transition state or is a CSS specificity problem where `bg-yellow-500` from another context leaks through Tailwind's `cn()` merge. Investigate: (1) does the Radix Progress indicator show a visible strip at value=0 due to subpixel rendering, (2) is `indicatorClassName` being overridden by base styles, (3) could this be the header task progress bar (`phaseBarColor`) being mistaken for the cost bar.
  - Files: `aloop/cli/dashboard/src/components/progress/CostDisplay.tsx`, `aloop/cli/dashboard/src/components/ui/progress.tsx`
  - Tests: Add a test verifying `indicatorClass(0)` returns green and that at 0% the progress bar either renders green or is hidden

### Up Next

- [ ] Rebuild dashboard dist after bug fixes — `aloop/cli/dist/dashboard/index.html` and `aloop/cli/dist/index.js` are already modified (shown in git status), ensure they reflect the source fixes

### Completed

- [x] [qa/P1] Fix `/api/cost/aggregate` SQL query — changed from nonexistent `usage` table to correct `message` table with `json_extract` per SPEC-ADDENDUM

### Notes

- Bugs #2 and #3 from QA share the same root cause (wrong SQL table name). Fixing the query in `dashboard.ts:1133` resolves both.
- The `CostDisplay` component rendering logic and `useCost` hook design are correct — they work as specified once the API returns valid data.
- The `opencode db` CLI interface exists and works (QA confirmed `opencode db` was functional with v1.2.25); only the SQL query is wrong.
