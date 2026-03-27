# Review Log

## Review — 2026-03-27 — commit 253261353..862676a99

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** `aloop/cli/dashboard/src/components/session/SessionCard.tsx`, `SessionCard.stories.tsx`, `SteerInput.tsx`, `SteerInput.stories.tsx`, `AppView.tsx`

**Commits reviewed:**
- `bea6cb7c2` feat: extract SessionCard into standalone component with Storybook stories
- `862676a99` feat: extract SteerInput into standalone component with Storybook stories

### Gate-by-gate summary

**Gate 1 — Spec Compliance: PASS**
- Both extractions match their TODO tasks exactly. SessionCard.tsx removes inner function from AppView.tsx:502 and exposes an explicit props interface. SteerInput.tsx removes the Footer inner function from ~line 1651. State management correctly kept in AppView.tsx (onOpenContextMenu callback carries setSuppressClickSessionId/setContextMenuPos/setContextMenuSessionId). 10 SessionCard stories + 7 SteerInput stories created.

**Gate 2 — Test Depth: FAIL**
- `SessionCard.tsx` has no `.test.tsx` file. The component has testable branches: suppressClick=true path (skips onSelect, calls onClearSuppressClick), tooltip tooltip content rendering with/without cost, stuckCount>0 showing red text. Prior extracted components in this same PR all have unit tests.
- `SteerInput.tsx` has no `.test.tsx` file. The component has testable branches: isRunning=true renders Stop dropdown not Resume button, isRunning=false renders Resume not Stop, Send button disabled on empty steerInstruction, Send button disabled on steerSubmitting=true, Enter-without-Shift keydown fires onSteer.
- Reference pattern: `StatusDot.test.tsx` tests 9 scenarios with concrete text assertions; `PhaseBadge.test.tsx` and `ElapsedTimer.test.tsx` follow the same pattern. SessionCard and SteerInput skip this entirely.

**Gate 3 — Coverage: FAIL**
- SessionCard.tsx: 0% branch coverage (no test file).
- SteerInput.tsx: 0% branch coverage (no test file).

**Gate 4 — Code Quality: PASS**
- No dead code. `openMenu` wrapper in SessionCard.tsx is used in two callsites (longPress + contextMenu). No unused imports — `useLongPress` removed from AppView.tsx and correctly placed in SessionCard.tsx. `GitBranch`, `Send`, `Square`, `Zap`, `ChevronDown`, `Play`, `DropdownMenu*`, `Textarea` all still used in AppView.tsx.
- Constitution Rule 7 (< 150 LOC): SessionCard.tsx = 100 lines ✓, SteerInput.tsx = 80 lines ✓.

**Gate 5 — Integration Sanity: PASS**
- `tsc --noEmit`: clean.
- `npm test`: 32 failures / 1094 passes — same pre-existing baseline as prior review. No new failures.

**Gate 6 — Proof: FAIL**
- No screenshots in `proof-artifacts/` for any of the 17 new stories (10 SessionCard + 7 SteerInput). All previously extracted components in this PR have screenshots: StatusDot (7 screenshots), ElapsedTimer (3), PhaseBadge (6), ConnectionIndicator (3), CostDisplay (3), ArtifactViewer (2). The two new component stories have zero. The work is observable UI (Storybook stories) — skipping proof is not acceptable here.
- Iter-14 and iter-21 artifacts contain only `output.txt` — no proof-manifest.json.

**Gate 7 — Layout: SKIP**
- Purely a code extraction refactor. CSS classes, JSX structure, and layout behavior are identical to the originals in AppView.tsx. No new CSS or layout changes.

**Gate 8 — Versions: SKIP** (no dependency changes)

**Gate 9 — Documentation: PASS** (no user-facing behavior changes)

---

## Review — 2026-03-27 — commit dc13ca694..c45a7759f

**Verdict: PASS** (0 findings)
**Scope:** `aloop/bin/loop.sh`, `aloop/bin/loop.ps1`, `aloop/cli/src/commands/orchestrate.ts`, `aloop/cli/src/commands/orchestrate.test.ts`, `aloop/cli/dashboard/src/components/shared/StatusDot.tsx`, `aloop/cli/dashboard/src/components/shared/StatusDot.test.tsx`, `proof-artifacts/statusdot-{exited,stuck,unhealthy,unknown}.png`

**Commits reviewed:**
- `8ea8254e9` fix: address review blockers — StatusDot tests + proof screenshots
- `cba1c26be` fix: make child loops run without iteration cap in orchestrate mode
- `c45a7759f` test: fix broken import and add max_iterations dispatch tests

### Gate-by-gate summary

**Gate 1 — Spec Compliance: PASS**
- Iteration cap fix matches SPEC-ADDENDUM §"Orchestrate Mode: No Iteration Cap". Implementation uses `0` as "unlimited" sentinel via CLI flag `--max-iterations 0`, achieving identical behavior to spec's "absent from loop-plan.json" language.
- Prior review findings (StatusDot shallow tests, missing screenshots) resolved in `8ea8254e9`.

**Gate 2 — Test Depth: PASS**
- New tests (`orchestrate.test.ts:2472–2503`) assert exact values: `'0'` for undefined maxIterations, `'50'` for explicit Linux, `'25'` for explicit win32.
- StatusDot tests now use `screen.getByText('Running')` etc. via `sr-only` spans — concrete text assertions, not class checks.

**Gate 3 — Coverage: PASS**
- All 3 new code paths in `launchChildLoop` tested (undefined → 0, explicit Linux, explicit win32).
- Shell script changes have no unit test mechanism; covered at TS boundary.

**Gate 4 — Code Quality: PASS**
- No dead code. Minimal focused changes. Constitution Rule 1 satisfied (loop.sh modification adds only a condition check, no new functions).

**Gate 5 — Integration Sanity: PASS**
- `tsc --noEmit`: clean.
- `npm test`: 32 failures — all pre-existing (confirmed by baseline check). 3 new max_iterations tests pass (tests 16, 17, 18 in launchChildLoop suite).

**Gate 6 — Proof: PASS**
- StatusDot: 7/7 variant screenshots in `proof-artifacts/` (exited, stuck, unhealthy, unknown added in `8ea8254e9`; running, stopped, error existed previously). No proof-manifest.json present (minor administrative gap — screenshots themselves are sufficient evidence).
- Iteration cap: purely internal code change — empty proof is the correct outcome.

**Gate 7 — Layout: SKIP** (no UI changes)

**Gate 8 — Versions: SKIP** (no dependency changes)

**Gate 9 — Documentation: PASS**
- No doc changes required for internal fix. P2 loop.sh help text gap (opencode provider missing, wrong round-robin default) is tracked in TODO.md as a spec-gap item.

---
