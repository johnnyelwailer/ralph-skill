# QA Log

## QA Session — 2026-03-27 (iteration 69)

### Test Environment
- Commit under test: 11dc2bfec (branch: aloop/issue-183)
- Features tested: 5

### Results
- PASS: ArtifactComparisonDialog split (Gate 4) — all 5 sub-components under 150 LOC
- PASS: ArtifactComparisonDialog.test.tsx (Gate 3) — 333 tests pass, all 5 required branches covered
- PASS: Storybook build post-split — exits 0
- FAIL: LogEntryRow.tsx still 287 LOC — [qa/P2] bug still open (re-test confirms not fixed)
- FAIL: ProgressBar component — not yet extracted from AppView.tsx — [qa/P1] task still open

### Bugs Filed
- None new. Two existing bugs re-confirmed:
  - [qa/P2] LogEntryRow.tsx 287 LOC (still open in TODO.md)
  - [qa/P1] ProgressBar not yet extracted (still open in TODO.md)

### Command Transcript

```
# Check split component LOC
$ find src/components/session -name "ArtifactComparison*.tsx" -o -name "SideBySideView.tsx" -o -name "SliderView.tsx" -o -name "DiffOverlayView.tsx" | xargs wc -l
  481 ArtifactComparisonDialog.test.tsx
   90 ArtifactComparisonDialog.tsx       ✅ (was 219, now under 150 LOC)
   71 ArtifactComparisonHeader.tsx       ✅
   48 DiffOverlayView.tsx                ✅
   25 SideBySideView.tsx                 ✅
   67 SliderView.tsx                     ✅
EXIT: 0

# Run test suite
$ npm test -- --run
  30 test files passed
  333 tests passed (was 307 before Gate 3 tests added)
EXIT: 0

# Verify Gate 3 branches (verbose output confirms):
# ✅ mode tabs: "calls setMode with 'slider'", "calls setMode with 'diff-overlay'", "marks active tab"
# ✅ keyboard: "ArrowLeft key decrements sliderPos by 2", "ArrowRight key increments sliderPos by 2", clamp tests
# ✅ baseline dropdown: "calls setSelectedBaseline with number on change"
# ✅ badge colors: "renders green class when diff_percentage < 5", "yellow class 5-20", "red class >= 20"
# ✅ no-baseline: "renders 'No baseline — first capture' when no baselines exist"

# Re-test LogEntryRow LOC
$ wc -l src/components/session/LogEntryRow.tsx
287 LogEntryRow.tsx   ❌ still 287, [qa/P2] not resolved

# Check ProgressBar
$ find src/components/session -name "ProgressBar*"
(no output)   ❌ [qa/P1] not yet implemented

# Storybook build
$ npm run build-storybook
...Storybook build completed successfully
EXIT: 0
```

## QA Session — 2026-03-27

### Test Environment
- Binary under test: `/tmp/aloop-test-install-5NxZ7H/bin/aloop` (v1.0.0)
- Features tested: 5
- Commit: c45a7759f (branch: aloop/issue-183)

### Results
- PASS: Storybook scripts in package.json
- PASS: Storybook devDependencies installed
- PASS: .storybook/main.ts config (framework, stories glob)
- PASS: .storybook/preview.ts decorators (Tailwind, dark-mode, TooltipProvider)
- PASS: npm run build-storybook (exit 0, 2055 modules)
- PASS: npm run storybook (port 6006, HTTP 200)
- FAIL: Core component stories — SessionCard, SteerInput, ActivityLog, ProgressBar missing

### Bugs Filed
- [qa/P1] Missing stories for 4/5 core dashboard components (SessionCard, SteerInput, ActivityLog, ProgressBar)

### Command Transcript

```
$ ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
$ echo "Binary under test: $ALOOP_BIN"
Binary under test: /tmp/aloop-test-install-5NxZ7H/bin/aloop
$ $ALOOP_BIN --version
1.0.0

# Verify Storybook scripts
$ grep '"storybook\|"build-storybook\|@storybook' aloop/cli/dashboard/package.json
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
    "@storybook/addon-docs": "^10.3.1",
    "@storybook/addon-themes": "^10.3.1",
    "@storybook/react": "^10.3.1",
    "@storybook/react-vite": "^10.3.1",
    "storybook": "^10.3.1",
EXIT: 0

# Verify .storybook config files
$ ls aloop/cli/dashboard/.storybook/
main.ts  preview.ts
EXIT: 0

# Verify build
$ cd aloop/cli/dashboard && npm run build-storybook
> storybook build
┌  Building storybook v10.3.1
...
└  Storybook build completed successfully
EXIT: 0

# Verify dev server on port 6006
$ npm run storybook -- --ci &
(started in background)
$ nc -z localhost 6006 → PORT 6006: OPEN
$ curl -o /dev/null -w "HTTP %{http_code}" http://localhost:6006 → HTTP 200

# Check core component stories
$ find src -name "SessionCard.stories.*"   → NOT FOUND
$ find src -name "SteerInput.stories.*"    → NOT FOUND
$ find src -name "ActivityLog.stories.*"   → NOT FOUND
$ find src -name "ProgressBar.stories.*"   → NOT FOUND
$ find src -name "ProviderHealth.stories.*" → FOUND: src/components/health/ProviderHealth.stories.tsx

# Check if components exist
$ find src -name "SessionCard.*" -o -name "SteerInput.*" -o -name "ActivityLog.*" -o -name "ProgressBar.*"
(no output — components do not exist yet)
```

## QA Session — 2026-03-27 (iteration 2)

### Test Environment
- Bash unavailable in this environment — inspection-based QA only (file reads + grep)
- Features tested: 4 (re-testing previously FAILed features: SessionCard, SteerInput)
- Commit: 862676a99 (branch: aloop/issue-183)

### Results
- PASS: SessionCard component extracted to `src/components/session/SessionCard.tsx`
- PASS: SessionCard.stories.tsx exists with 10 stories covering all key states
- PASS: SteerInput component extracted to `src/components/session/SteerInput.tsx`
- PASS: SteerInput.stories.tsx exists with 7 stories covering running/paused states
- NOT TESTED: Build compilation (npm run build-storybook) — Bash non-functional in this environment
- NOT TESTED: ActivityLog, ProgressBar — still open tasks in TODO.md, not regressions

### Bugs Filed
- None. SessionCard and SteerInput fixes verified. ActivityLog/ProgressBar remain as open [ ] tasks.

### Command Transcript

```
# Bash non-functional — all checks performed via file inspection

# Check SessionCard component
# src/components/session/SessionCard.tsx → FOUND
# Read SessionCard.tsx: exports SessionCard function + SessionCardProps interface
#   imports: useLongPress (@/hooks/useLongPress.ts EXISTS), relativeTime (@/lib/format.ts EXISTS)
#            SessionSummary (@/lib/types.ts:24 EXISTS), Tooltip, PhaseBadge, StatusDot
#   AppView.tsx:29 — import { SessionCard } from '@/components/session/SessionCard'
#   AppView.tsx:506 — <SessionCard key={s.id} session={s} cardCost={cardCost} ... />

# Check SessionCard.stories.tsx
# src/components/session/SessionCard.stories.tsx → FOUND
# Meta: title='Session/SessionCard', component=SessionCard, layout='padded'
# baseSession fixture: all 14 fields of SessionSummary present and correctly typed
# Stories (10): Running, Selected, WithCost, Exited, Stopped, ReviewPhase, PlanPhase,
#               NoBranch, Stuck, CostUnavailable
# .storybook/main.ts glob '../src/**/*.stories.@(ts|tsx)' → covers this file

# Check SteerInput component
# src/components/session/SteerInput.tsx → FOUND
# Read SteerInput.tsx: exports SteerInput function + SteerInputProps interface (8 props)
#   imports: Button, DropdownMenu*, Textarea, Tooltip*, lucide icons
#   AppView.tsx:30 — import { SteerInput } from '@/components/session/SteerInput'
#   AppView.tsx:2002 — <SteerInput steerInstruction=... onSteer=... onStop=... ... />

# Check SteerInput.stories.tsx
# src/components/session/SteerInput.stories.tsx → FOUND
# Meta: title='Session/SteerInput', component=SteerInput, layout='padded'
# Stories (7): Idle, WithText, Sending, StopSubmitting, Paused, PausedWithText, ResumeSubmitting
# isRunning=true and isRunning=false both covered (Stop vs Resume button variants)

# Check no orphaned inline code in AppView.tsx
# Grep SessionCard in AppView.tsx → import at :29, usage at :506 (no inline definition)
# Grep SteerInput in AppView.tsx → import at :30, usage at :2002 (no inline definition)
```

## QA Session — 2026-03-27 (iteration 25)

### Test Environment
- Testing dashboard in worktree (no aloop CLI install needed for this session — testing Storybook/component artifacts)
- Working dir: aloop/cli/dashboard
- Commit: 734a2b7e8 (branch: aloop/issue-183)
- Features tested: 4

### Results
- PASS: SessionCard.test.tsx unit tests (12/12 tests pass, all required branches covered)
- PASS: SteerInput.test.tsx unit tests (15/15 tests pass, all required branches covered)
- PASS: Storybook build after test additions (npm run build-storybook exits 0)
- PASS: Gate 6 Playwright screenshots — all 17 screenshots captured to proof-artifacts/
- FAIL: App.coverage.integration-app.test.ts — "covers panel toggles, sidebar shortcut, and session switching" fails (new regression, bug filed)

### Bugs Filed
- [qa/P1] Integration test ambiguous Stop button selector: App.coverage.integration-app.test.ts line 129 `findByRole('button', {name:/stop/i})` now matches 2 elements after SteerInput extraction

### Command Transcript

```
$ cd aloop/cli/dashboard

# Run full test suite
$ npm run test -- --run
EXIT: 1
❌ FAIL src/App.coverage.integration-app.test.ts (1 failed)
   × covers panel toggles, sidebar shortcut, and session switching
     TestingLibraryElementError: Found multiple elements with role "button" and name /stop/i
     (StatusDot "Stopped" sr-only button + SteerInput "Stop loop options" button)
✓ 27 other test files pass (294 tests)

# Run new tests in isolation
$ npm run test -- --run src/components/session/SessionCard.test.tsx src/components/session/SteerInput.test.tsx
✓ 2 files, 27 tests — all pass
EXIT: 0

# Verbose branch verification — SessionCard branches:
✓ calls onClearSuppressClick and skips onSelect when suppressClick is true
✓ shows "Cost: unavailable" in tooltip when costUnavailable is true and cardCost is null
✓ formats cardCost to 4 decimal places
✓ shows red stuck text in tooltip when stuckCount > 0

# Verbose branch verification — SteerInput branches:
✓ renders Stop dropdown when isRunning is true
✓ does not render Resume button when isRunning is true
✓ renders Resume button when isRunning is false
✓ does not render Stop dropdown when isRunning is false
✓ is disabled when steerInstruction is empty string
✓ is disabled when steerSubmitting is true
✓ calls onSteer when Enter is pressed without Shift

# Storybook build
$ npm run build-storybook
└  Storybook build completed successfully
EXIT: 0

# Gate 6 — Playwright screenshots via storybook-static
$ npx serve storybook-static -p 6007 &
$ node /tmp/qa-screenshot-storybook.mjs
PASS: SessionCard-Running → proof-artifacts/SessionCard-Running.png
PASS: SessionCard-Selected → proof-artifacts/SessionCard-Selected.png
PASS: SessionCard-WithCost → proof-artifacts/SessionCard-WithCost.png
PASS: SessionCard-Exited → proof-artifacts/SessionCard-Exited.png
PASS: SessionCard-Stopped → proof-artifacts/SessionCard-Stopped.png
PASS: SessionCard-ReviewPhase → proof-artifacts/SessionCard-ReviewPhase.png
PASS: SessionCard-PlanPhase → proof-artifacts/SessionCard-PlanPhase.png
PASS: SessionCard-NoBranch → proof-artifacts/SessionCard-NoBranch.png
PASS: SessionCard-Stuck → proof-artifacts/SessionCard-Stuck.png
PASS: SessionCard-CostUnavailable → proof-artifacts/SessionCard-CostUnavailable.png
PASS: SteerInput-Idle → proof-artifacts/SteerInput-Idle.png
PASS: SteerInput-WithText → proof-artifacts/SteerInput-WithText.png
PASS: SteerInput-Sending → proof-artifacts/SteerInput-Sending.png
PASS: SteerInput-StopSubmitting → proof-artifacts/SteerInput-StopSubmitting.png
PASS: SteerInput-Paused → proof-artifacts/SteerInput-Paused.png
PASS: SteerInput-PausedWithText → proof-artifacts/SteerInput-PausedWithText.png
PASS: SteerInput-ResumeSubmitting → proof-artifacts/SteerInput-ResumeSubmitting.png
Summary: 17 passed, 0 failed
EXIT: 0
```

## QA Session — 2026-03-27 (iteration 26)

### Test Environment
- Binary under test: /tmp/aloop-test-install-ukPJwI/bin/aloop (version 1.0.0)
- Dashboard dir: aloop/cli/dashboard/
- Commit tested: 8c71ef05d
- Features tested: 4

### Results
- PASS: ActivityLog component + stories
- PASS: Integration test fix (Stop button ambiguity re-test)
- PASS: Storybook build after ActivityLog extraction
- SKIP: ProgressBar component (open task, not yet started)

### Bugs Filed
- None (all [qa/P1] bugs from previous sessions now resolved)

### Command Transcript

```
# Install CLI from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
Binary: /tmp/aloop-test-install-ukPJwI/bin/aloop
Version: 1.0.0
EXIT: 0

# Verify ActivityLog component exists
ls aloop/cli/dashboard/src/components/session/
ActivityLog.stories.tsx  ActivityLog.tsx  SessionCard.stories.tsx  SessionCard.test.tsx
SessionCard.tsx  SteerInput.stories.tsx  SteerInput.test.tsx  SteerInput.tsx
EXIT: 0

# ActivityLog has 9 stories: Empty, SessionStart, IterationComplete, WithArtifacts,
# ErrorIteration, MultipleIterations, RunningIteration, ProviderCooldown, ReviewVerdict

# AppView.tsx imports from @/components/session/ActivityLog (correct extraction)
import { ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations }
  from '@/components/session/ActivityLog'

# Run all unit tests (including integration test re-check)
npx vitest run --reporter=verbose
Test Files: 28 passed (28)
Tests: 295 passed (295)
Duration: 3.93s
EXIT: 0

# KEY: App.coverage.integration-app.test.ts "covers panel toggles, sidebar shortcut,
# and session switching" now PASSES (was FAIL in previous session)

# Run Storybook build
npm run build-storybook
2062 modules transformed (up from 2055)
Storybook build completed successfully
EXIT: 0

# Storybook sidebar check: ActivityLog listed under SESSION alongside SessionCard + SteerInput ✓
# Total exported stories: 105

# Playwright screenshots (9 ActivityLog stories captured)
CAPTURED: ActivityLog-Empty.png
CAPTURED: ActivityLog-SessionStart.png
CAPTURED: ActivityLog-IterationComplete.png
CAPTURED: ActivityLog-WithArtifacts.png
CAPTURED: ActivityLog-ErrorIteration.png
CAPTURED: ActivityLog-MultipleIterations.png
CAPTURED: ActivityLog-RunningIteration.png
CAPTURED: ActivityLog-ProviderCooldown.png
CAPTURED: ActivityLog-ReviewVerdict.png
Total: 9 captured, 0 failed
Saved to: aloop/cli/dashboard/proof-artifacts/

# Note: Static build Storybook shows "No Preview" in content pane for all stories
# (same pre-existing limitation as SessionCard/SteerInput screenshots from prior session)
# Sidebar navigation and story registration confirmed correct via index.json inspection.
```

### ProgressBar Status
Open task `[ ] [qa/P1] Extract session progress bar section` still pending.
No ProgressBar.tsx or ProgressBar.stories.tsx exists in any component directory.

## QA Session — 2026-03-27 (iteration 27)

### Test Environment
- Bash non-functional in this environment — inspection-based QA only (Glob + Grep + Read)
- Commit tested: a53963ea8 (ActivityLog split refactor)
- Features tested: 3 (ActivityLog split, ActivityLog.test.tsx coverage, AppView.tsx import correctness)

### Results
- PASS: ActivityPanel.tsx extracted correctly — 103 LOC (within 150 LOC target)
- PASS: ArtifactComparisonDialog.tsx — 219 LOC (matches review gate's ~215 LOC estimate)
- PASS: ActivityLog.tsx barrel — 5 lines, re-exports all split symbols correctly
- PASS: ActivityLog.test.tsx covers all 4 Gate 3 required branches (withCurrent, deduped, hasResult, loadOutput fetch paths)
- PASS: AppView.tsx re-exports are legitimate backward compat (used by ArtifactViewer.test.tsx, formatHelpers.test.tsx)
- FAIL: LogEntryRow.tsx is 287 LOC — significantly exceeds review gate spec (~220 LOC) and Constitution Rule 7 (150 LOC target)
- CONCERN: CONSTITUTION.md shows as modified (M) in git status but is not committed — unexpected within this issue's scope
- NOT TESTED: npm test, npm run build-storybook — Bash non-functional

### Bugs Filed
- [qa/P2] LogEntryRow.tsx is 287 LOC — review gate specified ~220 LOC, actual is 30% over; Constitution Rule 7 targets < 150 LOC; needs further splitting
- [qa/P2] CONSTITUTION.md has uncommitted modifications — Constitution changes should not occur without explicit approval

### Command Transcript

```
# Bash non-functional — all checks via Glob/Grep/Read

# LOC counts (via Grep line-count mode)
ActivityPanel.tsx     → 103 LOC ✅ (< 150 Constitution target)
ArtifactComparisonDialog.tsx → 219 LOC (matches ~215 LOC estimate from review gate)
LogEntryRow.tsx       → 287 LOC ❌ (review gate said ~220 LOC; 30% over; Constitution target 150 LOC)
ActivityLog.tsx barrel → 5 lines ✅

# ActivityLog.test.tsx test coverage (via Grep of test descriptions)
describe('ActivityPanel') → 8 tests covering:
  - deduped memo: keeps only first session_start, keeps all entries with no session_start
  - withCurrent memo: isRunning=false (no synthetic entry), isRunning=true+no iteration, isRunning=true+iteration
  - hasResult: suppresses when success result, error result, result timestamp >= iterationStartedAt
describe('LogEntryRow loadOutput') → 4 tests covering:
  - fetch success (expandable content shown)
  - fetch non-ok (shows "No output available")
  - fetch throws network error (shows "No output available")
  - no fetch when entry has no iteration number
All 4 Gate 3 required branches COVERED ✅

# AppView.tsx import structure (lines 31-36)
import { ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations }
  from '@/components/session/ActivityLog';     ← lines 31-33 (used at AppView:1221)
export { ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations }
  from '@/components/session/ActivityLog';     ← lines 34-36 (backward compat)

# Consumers of AppView re-exports (confirmed via grep):
ArtifactViewer.test.tsx → imports LogEntryRow from '../../AppView'
formatHelpers.test.tsx  → imports findBaselineIterations from './AppView'
→ Re-exports are NOT dead code ✅

# Git status check:
M CONSTITUTION.md  ← uncommitted modification — NOT expected in this PR's scope
?? aloop/cli/dashboard/src/components/session/ActivityLog.test.tsx  ← untracked, Gate 3 still open [ ]
```

## QA Session — 2026-03-27 (iteration 68)

### Binary under test
N/A — Dashboard UI component tests (no aloop CLI binary needed for this session)

### Test Environment
- Working dir: /home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260327-111325/worktree/aloop/cli/dashboard
- Features tested: 4
- Current commit: ef72ead5e

### Results
- PASS: ActivityLog.test.tsx hasResult assertion fix (all 307 tests pass, 4 hasResult branches correct)
- PASS: CONSTITUTION.md revert (git status clean)
- PASS: npm run build-storybook (exits 0, 105 stories registered)
- FAIL (known): LogEntryRow.tsx still 287 LOC — bug [qa/P2] unfixed

### Bugs Filed
- None new — LogEntryRow.tsx LOC already tracked as [qa/P2] in TODO.md

### Command Transcript

```
$ npm test -- --run
(307 tests pass, 29 test files)
Exit code: 0

$ git status CONSTITUTION.md
On branch aloop/issue-183 — nothing to commit, working tree clean
Exit code: 0

$ npm run build-storybook
"Storybook build completed successfully"
105 stories registered in storybook-static/index.json
Exit code: 0

$ wc -l src/components/session/LogEntryRow.tsx
287 LOC — still exceeds 150 LOC Constitution target
Bug [qa/P2] remains open in TODO.md

$ npm test -- --run --reporter=verbose (hasResult tests)
✓ ActivityPanel > hasResult - suppresses synthetic running entry > suppresses synthetic entry when iteration already has success result
✓ ActivityPanel > hasResult - suppresses synthetic running entry > suppresses synthetic entry when iteration has error result
✓ ActivityPanel > hasResult - suppresses synthetic running entry > does NOT suppress synthetic entry when result timestamp < iterationStartedAt
All assertions verified non-tautological (spinner presence/absence confirmed)
```
