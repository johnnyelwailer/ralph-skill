# QA Log

## QA Session — 2026-03-22 (iteration 16)

### Test Environment
- Dashboard URL: http://localhost:43591
- Dashboard binary: /home/pj/.aloop/cli/aloop.mjs (running PID 277520)
- Playwright version: 1.58.2
- Viewport: 1920x1080 (desktop)
- Features tested: 5
- Commit under test: 3ab5f2f

### Results
- PASS: Desktop layout verification (two-column with sidebar, header, footer)
- PASS: Sidebar toggle (Ctrl+B) — 256px↔40px, collapsed icon-only state
- PASS: SessionDetail in Header — all SPEC fields present
- PASS: Collapsed sidebar state — 40px with stacked dots
- PARTIAL: Session cards — dots/phase/iter/time work, branch missing
- FAIL: Session card branch display — API returns no branch field

### Bugs Filed
- [qa/P1] Branch name missing from session cards and API response
- Updated deferred bug: "recent" label still shown instead of "Older"

### Command Transcript

**Setup:**
```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:43591
200
$ npx playwright --version
Version 1.58.2
```

**TEST 1: Desktop Layout Verification**
```
$ node /tmp/qa-dashboard-test3.mjs
Layout: sidebar <aside> found at 256px width, header <header> at 43px height
Root: div.h-screen.flex.flex-col at 1920x1080
Screenshot: artifacts/qa-desktop-layout.png
RESULT: PASS — matches SPEC line 1104 wireframe
```

**TEST 2: Sidebar Toggle (Ctrl+B)**
```
Before Ctrl+B: sidebar width=256px, display=flex
After Ctrl+B: sidebar width=40px, isIconOnly=true, dotCount=4
After second Ctrl+B: sidebar width=256px (restored)
Screenshots: artifacts/qa-sidebar-toggled.png, artifacts/qa-sidebar-collapsed.png
RESULT: PASS — matches SPEC line 1068 (collapsible) and 1098 (40px icon-only bar with dots)
```

**TEST 3: Session Cards**
```
Session cards found: 14+ button elements in sidebar
Each card shows: session name, relative time ("25m ago"), phase ("qa"), iteration ("iter 16")
Status dots: 4 found (green for active sessions)
Branch names: NOT FOUND in any card text or HTML
API /api/state activeSessions keys: [session_id, session_dir, project_root, pid, work_dir, started_at, provider, mode, iteration, phase, stuck_count, state, updated_at, iteration_started_at]
"branch" key: NOT PRESENT in API response
RESULT: PARTIAL — all fields except branch render correctly. Branch is absent from API.
```

**TEST 4: Active/Older Grouping**
```
Group labels found: ["ralph-skill1", "orchestrator-20260321-1729323", "recent10"]
"Active" label: not found
"Older" label: not found — "recent" used instead
Collapsible sections: present (data-state="open"/"closed")
RESULT: PARTIAL — grouping by project works, but "recent" label doesn't match SPEC "Older (N)"
```

**TEST 5: SessionDetail in Header**
```
Header text: "Aloop Dashboard orchestrator-20260321-172932 iter 16/∞ · 16 todos 88% qa claude running Live K 09:57:54 AM"
Session name: ✓ (orchestrator-20260321-172932)
Iteration counter: ✓ (iter 16/∞ · 16 todos)
Progress bar: ✓ (88%, class="relative w-full overflow-hidden rounded-full bg-muted flex-1 h-1.5")
Phase badge: ✓ (qa)
Provider: ✓ (claude)
Connection: ✓ (Live)
Status dot: ✓ (1 dot in header, green)
Ctrl+K hint: ✓ (K shown in header)
RESULT: PASS — all SPEC line 1124-1130 fields present
```

### Screenshots
- `artifacts/qa-desktop-layout.png` — Full desktop layout at 1920x1080
- `artifacts/qa-sidebar-toggled.png` — Sidebar after first Ctrl+B toggle (collapsed to 40px)
- `artifacts/qa-sidebar-collapsed.png` — Collapsed sidebar with stacked dots
- `artifacts/qa-dashboard-final.png` — Final state after all tests

## QA Session — 2026-03-22 (iteration 18)

### Test Environment
- Bash execution: BLOCKED — all commands fail (exit codes 1, 128, 134). Cannot run curl, node, npx, git, or any CLI.
- Dashboard URL: unknown (previous session used http://localhost:43591 but cannot verify)
- Commit under test: 513efd8
- Features targeted: 4 (re-tests of previously FAIL/PARTIAL features)

### Environment Blocker
Bash tool is completely non-functional in this QA sandbox — every command (echo, true, date, curl, node, git) fails with exit code 1 or 134. This prevents:
- Running Playwright browser tests
- Fetching dashboard API endpoints
- Running CLI commands
- Taking screenshots
- Running automated test suite

### What Could Be Verified (file-level only)
1. **Component file existence**: All 5 required files present ✓
   - `SessionCard.tsx` (67 LOC), `SessionList.tsx` (87 LOC), `SessionDetail.tsx` (67 LOC), `Sidebar.tsx` (83 LOC), `helpers.tsx` (86 LOC)
2. **<150 LOC acceptance criterion**: All files under 150 LOC ✓
3. **Unit test files exist**: `SessionCard.test.tsx`, `SessionList.test.tsx`, `helpers.test.tsx` ✓

### Status of Previously Filed Bugs
- **[qa/P1] Branch name missing**: Fix committed at 513efd8 ("fix: restore session branch display without session_dir"). Build agent reports 52/52 dashboard tests passing including regression test. **NEEDS RUNTIME RETEST** — cannot verify through browser.
- **[qa/deferred] "recent" vs "Older" label**: Cancelled in TODO.md — verified as incorrect finding. Source renders "Older" per SPEC.

### Results
- PASS: Component file sizes (<150 LOC)
- PASS: All required component files exist
- NEEDS RETEST: Session card branch display (fix committed, no runtime access)
- CANCELLED: Active/Older label mismatch (prior finding was incorrect)

### Bugs Filed
- None new. Previous branch bug has fix committed but awaits runtime verification.

### Notes
This QA session was severely limited by the sandbox environment. The bash tool failure appears to be an infrastructure issue — not a product bug. All runtime tests (dashboard UI, API responses, keyboard shortcuts, visual layout) require a follow-up QA session with working bash access.
