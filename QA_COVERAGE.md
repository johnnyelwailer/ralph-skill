# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| 44x44px minimum tap targets | 2026-03-21 | ca9404f | PASS | 11/12 interactive elements >= 44x44px on 375x812 mobile viewport. Only failure is an invisible 0-height `<section>` element (not a real tap target). Buttons, tabs, action buttons all correctly sized. |
| Left-edge swipe gesture opens sidebar | 2026-03-21 | ca9404f | PASS | CDP touch swipe from x=5 to x=200 successfully opens sidebar. Hamburger button also works as fallback. |
| Long-press context menu on sessions | 2026-03-21 | ca9404f | PASS | Long-press (700ms) on session item in sidebar triggers a context popup showing session info (name, status, provider). |
| Long-press context menu on log entries | 2026-03-21 | ca9404f | SKIP | Activity tab shows "0 events" — no log entries available to test long-press on. Needs real session data. |
| HoverCard tap equivalents | 2026-03-21 | ca9404f | never | Not yet implemented per TODO.md |
| Tooltip tap-to-toggle | 2026-03-21 | ca9404f | never | Not yet implemented per TODO.md |
| No hover-only interactions | 2026-03-21 | ca9404f | never | Not yet implemented per TODO.md |
| Lighthouse accessibility >= 90 | 2026-03-21 | ca9404f | never | Not yet implemented per TODO.md |
