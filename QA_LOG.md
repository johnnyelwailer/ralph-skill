# QA Log

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
