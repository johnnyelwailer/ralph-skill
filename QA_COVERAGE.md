# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Desktop layout (two-column with sidebar) | 2026-03-22 | 3ab5f2f | PASS | Sidebar (256px) + main content, header + footer visible at 1920x1080 |
| Sidebar toggle (Ctrl+B) | 2026-03-22 | 3ab5f2f | PASS | Toggles 256px↔40px, collapsed shows icon-only bar with status dots stacked |
| Session cards (status dots, phase, iter, time) | 2026-03-22 | 3ab5f2f | PARTIAL | Dots, phase, iteration, relative time all render. Branch fix committed (513efd8) but not runtime-verified. |
| Session card branch display | 2026-03-22 | 513efd8 | NEEDS RETEST | Fix committed (513efd8: restore session branch display without session_dir). Build agent claims 52/52 dashboard tests pass. Runtime verification blocked — bash unavailable in QA sandbox. |
| Active/Older session grouping | 2026-03-22 | 3ab5f2f | PASS | Groups by project name correctly. Prior "recent" vs "Older" finding was incorrect — code renders "Older" per SPEC. Cancelled in TODO.md. |
| SessionDetail in Header | 2026-03-22 | 3ab5f2f | PASS | Session name, iter counter (16/∞), progress bar (88%), phase badge (qa), provider (claude), "Live" connection, Ctrl+K hint all present |
| Collapsed sidebar state | 2026-03-22 | 3ab5f2f | PASS | 40px width, icon-only, status dots stacked vertically per SPEC line 1098 |
| Component file sizes (<150 LOC) | 2026-03-22 | 513efd8 | PASS | SessionCard:67, SessionList:87, SessionDetail:67, Sidebar:83, helpers:86. All under 150 LOC. |
