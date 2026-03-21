# QA Coverage

Coverage: 100%

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| GET /api/qa-coverage endpoint | 2026-03-21 | 557b190 | PASS | Happy path, missing file, no percentage, empty file, edge cases (0%, 100%, case-insensitive) |
| QACoverageBadge color coding | 2026-03-21 | 557b190 | PASS | Green >=80%, yellow 60-79%, red <60%, boundaries at 59/60/80 verified |
| QACoverageBadge visibility | 2026-03-21 | 557b190 | PASS | Hidden when file missing (available=false), shows "QA N/A" when no percentage |
| QACoverageBadge click-to-expand | 2026-03-21 | 557b190 | PASS | Renders markdown via marked, GFM table renders as HTML table, heading and prose visible |
| Badge refresh on SSE state events | 2026-03-21 | 557b190 | PASS | Badge re-fetches /api/qa-coverage on status.json change, percentage and color update live |
