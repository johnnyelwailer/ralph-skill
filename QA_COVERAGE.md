# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| Dashboard renders after component extraction | 2026-03-21 | b94cbc8 | PASS | Page loads, all panels visible, no console errors |
| SessionCard (sidebar session entries) | 2026-03-21 | b94cbc8 | PASS | Cards show session name, status dot, elapsed time, iteration count, phase name |
| SessionList (sidebar session grouping) | 2026-03-21 | b94cbc8 | PASS | Sessions grouped by project (RALPH-SKILL) and orchestrator parent, with RECENT section |
| Sidebar toggle (Ctrl+B) | 2026-03-21 | b94cbc8 | PASS | Collapses to narrow icon-only bar with colored status dots, expands back |
| Session switching (click card) | 2026-03-21 | b94cbc8 | PASS | Header, activity log, and documents update when clicking different session |
| URL session parameter | 2026-03-21 | b94cbc8 | PASS | ?session=<id> updates in URL bar after switching sessions |
| Dashboard layout (1920x1080) | 2026-03-21 | b94cbc8 | PASS | Two-column layout: sidebar (256px) + main (1664px), header + docs + activity + footer |
| Header bar elements | 2026-03-21 | b94cbc8 | PASS | Session name, iter counter, progress bar, phase badge, provider, status, connection indicator, Ctrl+K hint all present |
| Footer (steer + stop) | 2026-03-21 | b94cbc8 | PASS | Steer textarea with Send button, Stop button present |
| Session card branch name | 2026-03-21 | b94cbc8 | FAIL | Branch name not shown in session cards; spec requires it as a field |
| Session grouping labels | 2026-03-21 | b94cbc8 | FAIL | Groups show "RECENT" instead of spec's "Active"/"Older (N)" terminology |
| Force stop button | 2026-03-21 | b94cbc8 | FAIL | Only "Stop" button visible; spec requires separate "Force (SIGKILL)" button |
| Helpers (StatusDot, PhaseBadge, relativeTime) | 2026-03-21 | b94cbc8 | PASS | Status dots colored correctly (green for active, gray for inactive), phase names displayed, relative times shown |
