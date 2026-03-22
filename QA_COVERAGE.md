# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Desktop layout (two-column with sidebar) | 2026-03-22 | 3ab5f2f | PASS | Sidebar (256px) + main content, header + footer visible at 1920x1080 |
| Sidebar toggle (Ctrl+B) | 2026-03-22 | 3ab5f2f | PASS | Toggles 256px↔40px, collapsed shows icon-only bar with status dots stacked |
| Session cards (status dots, phase, iter, time) | 2026-03-22 | 3ab5f2f | PARTIAL | Dots, phase, iteration, relative time all render. Branch name missing from cards (bug filed) |
| Session card branch display | 2026-03-22 | 3ab5f2f | FAIL | SPEC line 1092 requires branch in card fields. API `/api/state` returns no `branch` key in session objects. Bug filed. |
| Active/Older session grouping | 2026-03-22 | 3ab5f2f | PARTIAL | Groups by project name correctly. Uses "recent" label instead of SPEC's "Older (N)". Existing deferred bug updated. |
| SessionDetail in Header | 2026-03-22 | 3ab5f2f | PASS | Session name, iter counter (16/∞), progress bar (88%), phase badge (qa), provider (claude), "Live" connection, Ctrl+K hint all present |
| Collapsed sidebar state | 2026-03-22 | 3ab5f2f | PASS | 40px width, icon-only, status dots stacked vertically per SPEC line 1098 |
