# QA Log

## QA Session — 2026-03-24 (iteration 8)

### Test Environment
- Dashboard source: aloop/cli/dashboard/
- Commit under test: 1a32d9b8 (feat: extract PhaseBadge to shared component with tests and stories)
- Prior commit: 59042ea5 (chore(proof): capture Playwright screenshots for ElapsedTimer stories)
- Features tested: 5

### Results
- PASS: ElapsedTimer proof screenshots fix (Gate 6 re-test) — 3 PNG files in proof-artifacts/, proof-manifest.json has 11 entries
- PASS: shared/PhaseBadge.tsx extraction (component + test + stories)
- PASS: Unit test suite (244 tests / 23 files)
- PASS: TypeScript compilation (tsc --noEmit: no errors)
- PASS: Production vite build (462KB bundle)
- PASS: Storybook build (69 stories, +6 PhaseBadge stories)

### Bugs Filed
- None (0 new bugs)

### Command Transcript

```
$ ls src/components/shared/PhaseBadge*
# src/components/shared/PhaseBadge.stories.tsx
# src/components/shared/PhaseBadge.test.tsx
# src/components/shared/PhaseBadge.tsx
# exit: 0

$ grep -n "PhaseBadge" src/AppView.tsx | head -20
# 27: import { PhaseBadge } from '@/components/shared/PhaseBadge';
# 595: {session.phase && <PhaseBadge phase={session.phase} small />}
# 819: <PhaseBadge phase={currentPhase} />
# 1782: {s.phase && <PhaseBadge phase={s.phase} small />}
# exit: 0

$ grep -n "function PhaseBadge|const PhaseBadge" src/AppView.tsx
# (no output — PASS: no inline definition remains)
# exit: 1

$ ls -la proof-artifacts/elapsedtimer-*.png
# elapsedtimer-juststarted.png   4882 bytes (Mar 24 13:18)
# elapsedtimer-ninetyseconds.png 5274 bytes (Mar 24 13:18)
# elapsedtimer-twominutes.png    5261 bytes (Mar 24 13:18)
# exit: 0

$ python3 -c "import json; data=json.load(open('proof-manifest.json')); print(len(data))"
# 11 entries (8 original + 3 ElapsedTimer)
# exit: 0

$ npm run test -- --run
# 23 files passed, 244 tests, 0 failures (+7 PhaseBadge.test.tsx)
# exit: 0

$ npx tsc --noEmit
# (no output — no errors)
# exit: 0

$ npm run build
# vite build: dist/assets/index-*.js 462.21 kB, built in 1.29s
# exit: 0

$ npx storybook build --output-dir /tmp/qa-storybook-iter8
# Storybook build completed successfully
# exit: 0

$ python3 -c "... count PhaseBadge + ElapsedTimer stories in /tmp/qa-storybook-iter8/index.json ..."
# Total stories: 69
# PhaseBadge stories: plan, build, proof, review, unknown, small (6 stories)
# ElapsedTimer stories: just-started, ninety-seconds, two-minutes (3 stories)
# exit: 0

$ rm -rf /tmp/qa-storybook-iter8
```

### Notes
- Test count increased from 237 (iter 7) to 244 (+7 PhaseBadge tests)
- Story count increased from 63 (iter 7) to 69 (+6 PhaseBadge stories)
- ElapsedTimer proof screenshots confirmed committed to git worktree (not session artifacts dir); proof-manifest.json in worktree has 11 entries
- No regressions from either PhaseBadge extraction or ElapsedTimer proof fix

---

## QA Session — 2026-03-24 (iteration 7)

### Test Environment
- Dashboard source: aloop/cli/dashboard/
- Commit under test: 94f217ae (refactor: extract ElapsedTimer component from AppView)
- Prior commit: fb37f88b (test(format): strengthen weak assertions in lib/format.test.ts)
- Features tested: 5

### Results
- PASS: lib/format.test.ts strengthened assertions (Gate 2 re-test)
- PASS: shared/ElapsedTimer.tsx extraction (component + test + stories)
- PASS: Unit test suite (237 tests / 22 files)
- PASS: TypeScript compilation (tsc --noEmit: no errors)
- PASS: Production vite build (462KB bundle)
- PASS: Storybook build (63 stories, +3 ElapsedTimer stories)

### Bugs Filed
- None (0 new bugs)

### Command Transcript

```
$ cd aloop/cli/dashboard && npm run test -- --run
# 22 passed, 237 tests, 0 failures (+7 ElapsedTimer.test.tsx)
# exit: 0

$ npx tsc --noEmit
# (no output — no errors)
# exit: 0

$ npm run build
# vite build: dist/assets/index-*.js 462.21 kB, built in 1.37s
# exit: 0

$ ls src/components/shared/ElapsedTimer*
# src/components/shared/ElapsedTimer.stories.tsx
# src/components/shared/ElapsedTimer.test.tsx
# src/components/shared/ElapsedTimer.tsx
# exit: 0

$ grep -n "ElapsedTimer" src/AppView.tsx
# 26: import { ElapsedTimer } from '@/components/shared/ElapsedTimer';
# 793: <ElapsedTimer since={startedAt} />
# 803: <ElapsedTimer since={startedAt} />
# 1342: <ElapsedTimer since={entry.timestamp} />
# (no inline definition — PASS)

$ grep -n "function ElapsedTimer|const ElapsedTimer" src/AppView.tsx
# (no output — PASS: no inline definition remains)

$ grep -n "toMatch|toBe.*-1m" src/lib/format.test.ts
# 28: expect(result).toMatch(/\d{1,2}:\d{2}/);
# 47: expect(result).toMatch(/\d{1,2}:\d{2}/);
# 81: expect(formatSecs(-5)).toBe('-1m');
# PASS: strengthened assertions present

$ npx vitest run --run ElapsedTimer
# 1 passed, 7 tests
# exit: 0

$ npx storybook build --output-dir /tmp/qa-storybook-iter7
# Storybook build completed successfully
# exit: 0

$ python3 -c "... count entries in /tmp/qa-storybook-iter7/index.json ..."
# Total stories: 63
# ElapsedTimer stories: just-started, ninety-seconds, two-minutes
# PASS

$ rm -rf /tmp/qa-storybook-iter7
```

### Notes
- Test count increased from 230 (iter 6) to 237 (+7 ElapsedTimer tests)
- Story count increased from 60 (iter 6) to 63 (+3 ElapsedTimer stories)
- All format.test.ts Gate 2 strengthened assertions confirmed present and passing

---

## QA Session — 2026-03-24 (iteration 5)

### Binary Under Test
- Not applicable (testing dashboard React app, not CLI binary)
- Dashboard dir: `aloop/cli/dashboard/`
- Commit under test: acb8fb08

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260324-085402/worktree`
- Features tested: 5

### Results
- PASS: lib/format.ts extraction, formatHelpers unit tests (14), full unit suite (189), TypeScript compilation, vite build, Storybook build (60 stories)
- FAIL: none

### Bugs Filed
- none

### Command Transcript

```
# 1. Verify lib/format.ts exports all 8 functions
cat aloop/cli/dashboard/src/lib/format.ts
# → exports: formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
#            relativeTime, formatTokenCount, parseDurationSeconds
# exit 0

# 2. Verify AppView.tsx has no inline definitions, only import+re-export
grep -n "^function format" aloop/cli/dashboard/src/AppView.tsx
# exit 1 (no matches — correct)

grep -n "lib/format" aloop/cli/dashboard/src/AppView.tsx
# 36:} from './lib/format';
# 40:} from './lib/format';

# 3. Run formatHelpers tests
cd aloop/cli/dashboard && npx vitest run --run formatHelpers
# Test Files  1 passed (1)
#       Tests 14 passed (14)
# exit 0

# 4. Full unit test suite
cd aloop/cli/dashboard && npx vitest run --run
# Test Files  20 passed (20)
#       Tests 189 passed (189)
# exit 0

# 5. TypeScript compilation
cd aloop/cli/dashboard && npx tsc --noEmit
# (no output — no errors)
# exit 0

# 6. Production vite build
cd aloop/cli/dashboard && npx vite build
# dist/assets/index-C4l-dbbf.js   462.21 kB
# ✓ built in 1.36s
# exit 0

# 7. Storybook build
cd aloop/cli/dashboard && npx storybook build
# Storybook build completed successfully
# 60 stories in index.json
# exit 0
```

---

## QA Session — 2026-03-21 (iteration 1)

### Binary Under Test
- Not applicable (testing Storybook config, not aloop CLI binary)
- Dashboard dir: `aloop/cli/dashboard/`

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260321-182554/worktree`
- Features tested: 5

### Results
- PASS: Storybook main config, Storybook preview config, storybook dev server, storybook build, Tailwind CSS integration
- FAIL: none

### Observations (not bugs)
1. **addon-essentials version mismatch**: `@storybook/addon-essentials@8.6.14` vs `storybook@8.6.18` — triggers a WARN during dev server startup. Not a functional issue but should be aligned.
2. **No story files warning**: `npx storybook build` warns "No story files found" — expected since `button.stories.tsx` hasn't been created yet (remaining TODO task).
3. **storybook-static not gitignored**: Build output directory `storybook-static/` is not in `.gitignore` — could be accidentally committed.
4. **Spec path mismatch**: SPEC-ADDENDUM references `aloop/dashboard/.storybook/` but dashboard actually lives at `aloop/cli/dashboard/.storybook/`. Cosmetic spec issue.

### Bugs Filed
- None — all completed features pass their acceptance criteria.

### Command Transcript

```
$ ls aloop/cli/dashboard/.storybook/
main.ts  preview.ts
# exit code: 0

$ cat aloop/cli/dashboard/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
# exit code: 0

$ cat aloop/cli/dashboard/.storybook/preview.ts
import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';
import { createElement } from 'react';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/index.css';
const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light', parentSelector: 'html' }),
    (Story) => createElement(TooltipProvider, { delayDuration: 300 }, createElement(Story)),
  ],
};
export default preview;
# exit code: 0

$ grep -E '@storybook' package.json
    "@storybook/addon-essentials": "^8.6.14",
    "@storybook/addon-themes": "^8.6.18",
    "@storybook/react": "^8.6.18",
    "@storybook/react-vite": "^8.6.18",
# exit code: 0

$ ls node_modules/@storybook/
addon-actions addon-backgrounds addon-controls addon-docs addon-essentials
addon-highlight addon-measure addon-outline addon-themes addon-toolbars
addon-viewport blocks builder-vite components core csf-plugin global icons
manager-api preview-api react react-dom-shim react-vite theming
# exit code: 0

$ npx storybook build
@storybook/core v8.6.18
info => Cleaning outputDir: storybook-static
info => Loading presets
info => Building manager..
info => Manager built (94 ms)
info => Building preview..
WARN No story files found for the specified pattern: src/**/*.stories.@(ts|tsx)
✓ 132 modules transformed.
✓ built in 2.47s
info => Preview built (13 s)
info => Output directory: .../storybook-static
# exit code: 0

$ timeout 15 npx storybook dev -p 6007 --ci
@storybook/core v8.6.18
WARN addon-essentials@8.6.14 incompatible with 8.6.18
info => Starting manager..
WARN No story files found
info => Starting preview..
# exit code: 124 (timeout — expected)

$ ls aloop/cli/dashboard/src/index.css
aloop/cli/dashboard/src/index.css
# exit code: 0
# Contains @tailwind base/components/utilities directives and CSS custom properties

$ ls aloop/cli/dashboard/src/components/ui/tooltip.tsx
aloop/cli/dashboard/src/components/ui/tooltip.tsx
# exit code: 0
```

### Cleanup
- Removed `storybook-static/` build output directory

---

## QA Session — 2026-03-24 (iteration 2)

### Binary Under Test
- Binary: `/tmp/aloop-test-install-*/bin/aloop`
- Version: 1.0.0 (installed via `npm run test-install -- --keep`)

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260324-085402/worktree`
- Features tested: 5
- Storybook static build: `/tmp/storybook-qa-build/`

### Results
- PASS: VERSIONS.md Storybook fix (Gate 8), SPEC-ADDENDUM.md Storybook 10 references (Gate 9), unit test suite (151/151), Storybook build with all 21 stories, component visual renders (ProviderHealth/AllHealthy, AllFailed, CostDisplay/NoBudgetCap, ArtifactViewer/SingleImage)
- FAIL: Proof screenshots validity (Gate 6) — all 8 story screenshots are identical "Not found" pages

### Bugs Filed
- [qa/P1] Proof screenshots invalid: all 8 identical "Not found" pages (MD5: 99b13def98aa849306b4f00e23948c59, 5199 bytes). Proof agent must use HTTP server, not file:// URLs.

### Command Transcript

```
# Install CLI from source
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>&1 | tail -1
/tmp/aloop-test-install-vX91Bb/bin/aloop
# Binary: /tmp/aloop-test-install-vX91Bb/bin/aloop
$ /tmp/aloop-test-install-vX91Bb/bin/aloop --version
1.0.0
# exit code: 0

# Gate 8: VERSIONS.md Storybook version
$ grep -n "storybook" VERSIONS.md
71:| @storybook/*                | 10.x    |
# PASS: 10.x correctly set

# Gate 9: SPEC-ADDENDUM.md Storybook references
$ grep -n "storybook" SPEC-ADDENDUM.md | grep -i "storybook 1"
139:- **Storybook 10** with `@storybook/react-vite` as the framework adapter
176:- [ ] Storybook 10 is configured with `@storybook/react-vite` in `aloop/dashboard/.storybook/`
# PASS: Both lines reference Storybook 10

# Unit test suite
$ npm test -- --run
Test Files: 19 passed (19)
Tests:      151 passed (151)
Duration:   1.95s
# exit code: 0

# Storybook build
$ npx storybook build --output-dir /tmp/storybook-qa-build
Storybook build completed successfully
# exit code: 0

# Verify stories in build index
$ cat /tmp/storybook-qa-build/index.json | python3 -c "..."
artifacts-artifactviewer--empty - Empty
artifacts-artifactviewer--single-image - Single Image
... (9 ArtifactViewer stories total)
health-providerhealth--all-healthy - All Healthy
... (5 ProviderHealth stories total)
progress-costdisplay--no-budget-cap - No Budget Cap
... (7 CostDisplay stories total)
# 21 stories total — PASS

# Verify proof screenshots
$ md5sum proof-artifacts/*.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/artifactviewer-singleimage.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/artifactviewer-withdiffbadgecritical.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/costdisplay-nobudgetcap.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/costdisplay-withbudgetcritical.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/costdisplay-withbudgetwarning.png
f5f57469cddc37df36e82a40382084a2  proof-artifacts/dashboard-mobile-390x844.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/providerhealth-allfailed.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/providerhealth-allhealthy.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/providerhealth-mixed.png
# FAIL: 8 identical story screenshots (all "Not found" pages)
# Only dashboard-mobile-390x844.png has unique content

# Visual verification via HTTP server
$ python3 -m http.server 7788 --directory /tmp/storybook-qa-build &
$ node qa-storybook-http.cjs  # Playwright screenshots via HTTP
# ProviderHealth/AllHealthy: green dots, "healthy" labels (claude, gemini, opencode) — PASS
# ProviderHealth/AllFailed: red X icons, "failed" labels (claude, gemini) — PASS
# CostDisplay/NoBudgetCap: "SPEND $1.23" card without budget bar — PASS
# ArtifactViewer/SingleImage: "1 artifact", screenshot.png, "Main page screenshot" — PASS
```

### Cleanup
- Removed Storybook build: `rm -rf /tmp/storybook-qa-build`
- Removed test install prefix (auto-cleaned by test-install)

---

## QA Session — 2026-03-24 (iteration 3)

### Binary Under Test
- Not applicable (testing dashboard component stories and docs, not aloop CLI binary)
- Dashboard dir: `aloop/cli/dashboard/`
- Commit under test: `6227a03c`

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260324-085402/worktree`
- Storybook served via: `python3 -m http.server 8787 --directory /tmp/qa-storybook-iter3`
- Playwright version: 1.58.2
- Features tested: 5 (Gate 4, Gate 8, Gate 9 docs; unit tests; Storybook visual stories; Gate 6 re-test)

### Results
- PASS: REVIEW_LOG.md Gate 4 (b0cf335a PASS entry prepended)
- PASS: VERSIONS.md Gate 8 (`@storybook/* | 10.x`)
- PASS: SPEC-ADDENDUM.md Gate 9 (Storybook 10 references)
- PASS: Unit test suite (151/151 tests)
- PASS: Storybook build (60 stories, all key component stories render correctly via HTTP)
  - ProviderHealth/AllHealthy: green dots, "healthy" for claude/gemini/opencode
  - ProviderHealth/AllFailed: red X icons, "failed" for claude/gemini
  - CostDisplay/NoBudgetCap: "SPEND $1.23" card, no budget bar
  - CostDisplay/WithBudgetCritical: "$9.50 / $10.00", red bar at 95%, warnings shown
  - ArtifactViewer/SingleImage: "1 artifact", screenshot.png, description shown
  - ArtifactViewer/WithDiffBadgeCritical: "1 artifact" with critical red badge
- FAIL: Proof screenshots (Gate 6 re-test) — still unfixed (P1 bug still open in TODO.md)

### Bugs Filed
- None new — proof screenshots P1 already tracked in TODO.md from iter 2 (still failing at iter 3)

### Command Transcript

```
$ grep -n "b0cf335a" REVIEW_LOG.md
# exit: 1 (hash not mentioned by name, but PASS entry is first entry in file — verified by diff of 6227a03c)

$ git diff 6227a03c~1 6227a03c -- REVIEW_LOG.md
# Shows b0cf335a PASS entry prepended (2026-03-21 PASS, commit 3492a61..a182934)
# exit: 0

$ grep -n "storybook" VERSIONS.md -i
# 71: | @storybook/*  | 10.x |
# exit: 0

$ grep -n -i "storybook" SPEC-ADDENDUM.md | grep -i "10\|storybook 1"
# 139: Storybook 10 with @storybook/react-vite
# 176: Storybook 10 is configured
# exit: 0

$ cd aloop/cli/dashboard && npm run test -- --run
# Test Files: 19 passed (19), Tests: 151 passed (151), Duration: 2.09s
# exit: 0

$ cd aloop/cli/dashboard && npx storybook build --output-dir /tmp/qa-storybook-iter3
# Storybook build completed successfully
# exit: 0

$ curl -s http://localhost:8787/index.json | python3 -c "..."
# Total stories: 60 (ArtifactViewer x9, ProviderHealth x5, CostDisplay x7, UI stories x39)

# Playwright visual screenshots via HTTP:
# health-providerhealth--all-healthy: "claude healthy just now / gemini healthy 5m ago / opencode healthy 2h ago"
# health-providerhealth--all-failed: "claude failed 5m ago / gemini failed 2h ago" (red X icons)
# progress-costdisplay--no-budget-cap: "SPEND $1.23" card
# progress-costdisplay--with-budget-critical: "$9.50 / $10.00", red progress bar 95%, "Warnings: 70%/90% · Pause: 95%"
# artifacts-artifactviewer--single-image: "1 artifact / screenshot.png / Main page screenshot"
# artifacts-artifactviewer--with-diff-badge-critical: "1 artifact / screenshot.png (red badge) / Main page screenshot"

$ md5sum proof-artifacts/*.png
# 8 of 9 still 99b13def98aa849306b4f00e23948c59 (Not found pages)
# dashboard-mobile-390x844.png: f5f57469cddc37df36e82a40382084a2 (unique)
# FAIL: proof-artifacts/ not fixed since iter 2
```

### Cleanup
- Storybook build: `rm -rf /tmp/qa-storybook-iter3`
- HTTP server killed
- Playwright test script removed

---

## QA Session — 2026-03-24 (iteration 4)

### Binary Under Test
- Not applicable (testing dashboard component refactor, not aloop CLI binary)
- Dashboard dir: `aloop/cli/dashboard/`
- Commit under test: `24974eb2` (refactor: extract lib/ansi.ts from AppView.tsx)

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260324-085402/worktree`
- Storybook served via: `python3 -m http.server 8891 --directory /tmp/qa-storybook-iter4`
- Playwright: available via npx (1.58.2)
- Features tested: 5

### Results
- PASS: lib/ansi.ts extraction — correct exports, correct imports in AppView.tsx
- PASS: Unit test suite — 189/189 (38 new ansi tests in lib/ansi.test.ts)
- PASS: Production vite build — succeeds, no TypeScript errors
- PASS: Storybook build — 60 stories, build succeeds post-extraction
- PASS: Gate 6 proof screenshots (re-test) — fixed in bf6a7427; all 9 screenshots unique (6–17KB), proof-manifest.json present

### Bugs Filed
- None — all tested features pass

### Command Transcript

```
$ cd aloop/cli/dashboard && npm run test -- --run
# Test Files: 20 passed (20), Tests: 189 passed (189), Duration: 2.10s
# exit: 0

$ npm run build
# vite build → dist/index.html 0.72kB, dist/assets/index-*.js 462kB
# exit: 0

$ npx storybook build --output-dir /tmp/qa-storybook-iter4
# "Storybook build completed successfully"
# exit: 0

$ curl -s http://localhost:8891/index.json | python3 -c "..."
# Stories: 60

$ grep -n "from.*lib/ansi" src/AppView.tsx
# 30: import { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';
# 31: export { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';

$ grep -n "export" src/lib/ansi.ts
# 3:  export interface AnsiStyle
# 14: export function stripAnsi
# 19: export const PALETTE_256
# 42: export function rgbStr
# 46: export function parseAnsiSegments
# 105: export function renderAnsiToHtml

$ md5sum proof-artifacts/*.png
# All 9 unique: 6575–17356 bytes (old "Not found" was 5199 bytes each)
# exit: 0

$ cat ~/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260324-085402/artifacts/proof-manifest.json
# 8 entries, all status: "ok", captured via playwright+http-server
```

### Cleanup
- Storybook build: `rm -rf /tmp/qa-storybook-iter4`
- HTTP server killed

## QA Session — 2026-03-24 (iteration 6)

### Test Environment
- Dashboard source: aloop/cli/dashboard/
- Commit under test: f71b9968 (refactor: extract lib/types.ts from AppView.tsx)
- Prior commit: e0b19b91 (test(format): add lib/format.test.ts)
- Features tested: 5

### Results
- PASS: lib/format.test.ts coverage (41 tests, all 8 functions)
- PASS: lib/types.ts extraction (13 types, AppView imports/re-exports)
- PASS: Unit test suite (230 tests / 21 files)
- PASS: TypeScript compilation (tsc --noEmit: no errors)
- PASS: Production vite build (462KB bundle)
- PASS: Storybook build (60 stories, no regressions)

### Bugs Filed
- None (0 new bugs)

### Command Transcript

```
$ cd aloop/cli/dashboard && npm run test -- --run
# 21 passed, 230 tests, 0 failures
# exit: 0

$ npx tsc --noEmit
# (no output — no errors)
# exit: 0

$ npm run build
# vite build: 462KB JS bundle, no errors
# exit: 0

$ npx storybook build
# 60 stories built successfully
# exit: 0

$ grep "^export" src/lib/types.ts
# 13 exports: SessionStatus, ArtifactManifest, DashboardState, SessionSummary,
# FileChange, LogEntry, ArtifactEntry, ManifestPayload, QACoverageFeature,
# QACoverageViewData, CostSessionResponse, ConnectionStatus, IterationUsage

$ grep "from.*lib/types" src/AppView.tsx
# line 49: imports from './lib/types'
# line 55: re-exports from './lib/types'

$ grep "describe\|it(" src/lib/format.test.ts | wc -l
# 48 (8 describe blocks + 41 it() tests)
# All 8 exported functions have dedicated test suites with happy path + edge cases
# exit: 0
```

### Notes
- Test count increased from 189 (prev QA iter 5) to 230 (+41 format.test.ts tests) — matches exactly
- AnsiStyle type correctly lives in lib/ansi.ts (extracted in prior iteration); not duplicated into lib/types.ts
- ComparisonMode type remains in AppView.tsx — not in scope for lib/types.ts extraction per TODO spec
- No regressions in Storybook (60 stories stable across last 4 iterations)

---

## QA Session — 2026-03-24 (iteration 9)

### Test Environment
- Dashboard dir: aloop/cli/dashboard
- Storybook static served via http-server on port 7891
- Features tested: 5

### Binary Under Test
- Not applicable (dashboard component extraction, not CLI)
- Commit under test: 804d4a72 (feat: extract StatusDot and ConnectionIndicator to shared component with tests and stories)

### Results
- PASS: shared/StatusDot.tsx extraction (17 tests, no inline defs in AppView)
- PASS: Unit test suite (261 tests / 24 files)
- PASS: TypeScript compilation (tsc --noEmit: no errors)
- PASS: Production vite build (462KB, no regressions)
- PASS: Storybook build (78 stories, StatusDot.stories.js present)
- PASS: StatusDot visual render — green dot (running), red dot (error), muted dot (stopped)
- PASS: ConnectionIndicator visual render — green "Live" icon (connected)
- FAIL: ConnectionIndicator story grouping — stories appear under shared-statusdot--* instead of shared-connectionindicator--*

### Bugs Filed
- [qa/P2] ConnectionIndicator stories mis-grouped under StatusDot in Storybook

### Command Transcript
```
# Unit tests
$ npx vitest run --run
  24 test files, 261 passed, 0 failures

# TypeScript check
$ npx tsc --noEmit
  (no output — clean)

# Vite build
$ npx vite build
  ✓ built in 1.21s; 462.22 kB JS

# Storybook build
$ npx storybook build
  ✓ built in 4.06s; StatusDot.stories present in assets

# Story ID enumeration (detecting bug)
$ curl -s http://localhost:7891/index.json | python3 -c "..."
  shared-statusdot--connected    # ConnectionIndicator story under wrong ID
  shared-statusdot--connecting   # ConnectionIndicator story under wrong ID
  shared-statusdot--disconnected # ConnectionIndicator story under wrong ID
  (should be shared-connectionindicator--* per component title in stories file)

# Playwright screenshots (6 captured)
  statusdot-running.png        5029 bytes  — green dot ✓
  statusdot-stopped.png        4987 bytes  — muted dot ✓
  statusdot-error.png          5003 bytes  — red dot ✓
  connectionindicator-connected.png    55375 bytes  — green "Live" icon ✓
  connectionindicator-connecting.png   55398 bytes  — yellow spinning icon ✓
  connectionindicator-disconnected.png (captured via correct ID)
```
