# Review Log

## Review — 2026-03-31 18:00 — commit bfc70e270..31eae70f6

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** AppView.tsx (ArtifactComparisonDialog close button), LogEntryRow.tsx (ImageLightbox close button, circular import), new lib files (ansi.ts, format.ts, log.ts, providerHealth.ts, types.ts), new components (SessionCard, StatusDot, PhaseBadge, SessionContextMenu), smoke.spec.ts e2e tests, README.md docs fix

**Commits reviewed:**
- `695eab63` test: verify mobile tap target sizes in dashboard e2e
- `24f70218` fix: address review feedback — remove scope creep, add long-press context menu
- `93bc5f19` feat(a11y): extract LogEntryRow component and fix touch target accessibility
- `a2227576` refactor: extract utility modules from AppView.tsx into lib/
- `740214b3` refactor: extract SessionCard, StatusDot, PhaseBadge from AppView.tsx
- `d8345637` fix: add 44px mobile tap targets to comparison-mode toggle buttons
- `41f94692` fix(a11y): add aria-label to close buttons, add accessibility tests
- `0a7fa8eb` chore: save work-in-progress before rebase
- `d098a05a` chore: save work-in-progress before rebase
- `bcf818f3` docs: fix CLI flag errors and document OpenCode limitation
- `31eae70f` docs(spec-review): approve issue-114 — all testable AC verified

**Gate results:**
- Gate 1 (Spec Compliance): FAIL — SPEC-ADDENDUM.md L240 requires all tap targets ≥44×44px. Two close buttons are missing mobile tap target classes: `AppView.tsx:985` (ArtifactComparisonDialog) and `LogEntryRow.tsx:344` (ImageLightbox). The spec-review in TODO.md verified AC4 but overlooked these modal close buttons. All other AC verified correctly.
- Gate 2 (Test Depth): PASS — LogEntryRow.accessibility.test.tsx tests keyboard toggle with actual DOM state verification (checks `.animate-fade-in` class presence/absence on Enter/Space). Comparison-mode tap target test checks className strings directly — appropriate for CSS verification. Session context menu tested at App.coverage.integration-sidebar.test.ts:119-174 with specific callback assertion (`expect(onStopSession).toHaveBeenCalledWith('sess-long-1', false)`).
- Gate 3 (Coverage): PASS — 156 tests in 21 files. New components covered: LogEntryRow has 6 dedicated accessibility tests; SessionCard long-press/contextMenu covered by integration-sidebar.test.ts; lib utilities tested via AppView re-exports in App.coverage.helpers.test.ts. No shallow fakes observed. Note: no test verifying close button tap target classes (blocked by Gate 1 finding).
- Gate 4 (Code Quality): FAIL — LogEntryRow.tsx imports `ArtifactComparisonDialog`, `ElapsedTimer`, `findBaselineIterations` from `'../AppView'` while AppView imports LogEntryRow back — circular dependency. The lib extraction refactoring (ansi.ts, format.ts, log.ts, providerHealth.ts, types.ts) is well-structured, but these 3 AppView exports should have been moved to their own files to complete the extraction.
- Gate 5 (Integration Sanity): PASS — 156 dashboard vitest tests pass; `tsc --noEmit` clean; Vite build succeeds (464kB JS bundle). CLI tests skipped (tsx not in PATH, environment issue).
- Gate 6 (Proof Verification): PASS — No proof manifest needed; UI/a11y changes produce no visual artifacts. Spec-review commit provides comprehensive per-criterion verification. Smoke e2e tests (smoke.spec.ts:162-183) serve as runtime proof for tap targets via Playwright bounding box measurement.
- Gate 7 (Runtime Layout): PASS — smoke.spec.ts verifies layout at 1920×1080 (3 columns side-by-side via bounding box X coordinate check), 375×667 (sidebar hidden, panels toggle), 390×844 (tap targets ≥44px via `boundingBox()` assertion for 8 elements including session card and footer buttons).
- Gate 8 (Version Compliance): PASS — no dependency changes in this PR.
- Gate 9 (Documentation Freshness): PASS — bcf818f3 corrects README: resume syntax `--launch-mode/--session-dir` → `--launch <session-id>`, adds OpenCode CLI limitation note, fixes steer command table, adds devcontainer-verify command.

**Findings:**
1. Gate 1: `AppView.tsx:985` close button — `className="text-muted-foreground hover:text-foreground text-lg font-bold px-1"` — missing `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0`
2. Gate 4: `LogEntryRow.tsx:8-20` — imports 3 runtime values from `'../AppView'` (ArtifactComparisonDialog, ElapsedTimer, findBaselineIterations) creating circular dep with AppView's `import { LogEntryRow }` at line 27

---
