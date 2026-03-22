# TODO

## QA Bugs

- [ ] [qa/P1] Progress bar shows yellow at 0% spend: Viewed dashboard with 0% budget used → progress bar indicator is yellow (rgb(234, 179, 8)) → spec says green < 70%, yellow 70-90%, red > 90%. The bar should be green at 0%. Tested at commit 17ad170. (priority: high)

- [ ] [qa/P1] Cost API returns "opencode_unavailable" when opencode IS installed: Called GET /api/cost/aggregate with opencode v1.2.25 installed and `opencode db` working → got `{"error":"opencode_unavailable"}` → spec says aggregate cost should be fetched via `opencode db`. The server fails to query opencode or misidentifies it as unavailable (likely a query/table mismatch). Tested at commit 17ad170. (priority: high)

- [ ] [qa/P1] No spend-vs-cap display ($X.XX / $Y.YY) in cost widget: Viewed dashboard with budget_cap_usd=10.00 in meta.json → top bar shows "Cost data unavailable" and "0%" but no "$X.XX / $Y.YY" format → spec says widget should display "Cumulative spend: $X.XX / $Y.YY (current / cap)". Budget cap value is not surfaced anywhere in the UI. Tested at commit 17ad170. (priority: high)
