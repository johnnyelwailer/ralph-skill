# Review Log

## Review — 2026-03-21 — commit 36039ef..8d528c9

**Verdict: FAIL** (2 findings → written to TODO.md as [review] tasks)
**Scope:** orchestrate.ts, start.ts, start.test.ts, orchestrate.test.ts, process-requests.ts

- Gate 4: `orchestrate.ts:5355` — PR review filter dropped `!needs_redispatch` guard during `(as any)` cleanup. Also removed `last_reviewed_sha` de-duplication from both orchestrate.ts and process-requests.ts without typed replacement. Risk: review spam and wasted API calls on unchanged PRs.
- Gate 3: `orchestrate.ts:3213` — `parseArtifactRemovalTargets` is a ~50-line branching parser with no direct unit tests. Only covered indirectly through 2 scan-pass integration tests. Edge cases (empty input, generic "working artifact", removal intent without known files) untested.

Gates 1,2,5,6,7,8,9: PASS. Type-check clean. No test regressions (10 failures all pre-existing on master). Tests for new code assert on exact values — no shallow fakes.

---

## Review — 2026-03-24 — commit 8c3d5a2c..ce5366e3

**Verdict: FAIL** (1 finding → written to TODO.md as [review] task)
**Scope:** index.ts, index.test.ts (commit 79f3ddf5), start.ts, start.test.ts, claude/commands/aloop/start.md (commit e4687499), orchestrate.ts + orchestrate.test.ts (commits 098d3006, 507c9dd0)

**Prior findings resolved:**
- Gate 4 (needs_redispatch guard): RESOLVED — commit 098d3006 restored `!i.needs_redispatch` filter at orchestrate.ts:5658 and added SHA-based skip check via `last_reviewed_sha` typed field and `headSha` fetch before review.
- Gate 3 (parseArtifactRemovalTargets coverage): RESOLVED — commit 507c9dd0 exported the function and added direct tests at orchestrate.test.ts:320-349. All 5 edge cases covered with concrete value assertions (null, exact arrays). Gate 2 quality is good.

**New finding:**
- Gate 1/Gate 2: `index.ts:192` — `help` command is NOT marked `{ hidden: true }`. Default `aloop --help` shows 7 commands (setup, start, dashboard, status, stop, steer, help). TASK_SPEC AC requires exactly 6: setup, start, status, steer, stop, dashboard. QA confirmed "PARTIAL — shows 7 (includes help itself)". Fix: add `{ hidden: true }` to help command registration. Also `index.test.ts:39-57` test title claims "only 6 user-facing commands" but doesn't assert `help` is absent — add `assert.doesNotMatch(result.stdout, /^\s+help\b/m)`.

**Also noted (not a new [review] task — already tracked as [qa/P2]):**
`orchestrate-launch.ts:106-110` writes meta.json for orchestrator sessions without `engine: 'orchestrate'`. The code at start.ts:1082 correctly writes `engine: 'loop'` for loop sessions, but the `launchOrchestrator()` function overwrites meta.json without the engine field for orchestrate sessions. Resume still works via `mode === 'orchestrate'` fallback, but spec requires the field.

**Gates passing:**
- Gate 2: New resume tests (start.test.ts:2413-2687) assert concrete values — mode field fallback, engine field detection, state-file missing error all tested with exact assertions. Good depth.
- Gate 3: New code coverage is solid. Resume paths well-covered (3 distinct paths: mode fallback, engine field, missing state → error).
- Gate 4: No dead code in changed files. No unused imports. help command registration clean except for missing `hidden: true`.
- Gate 5: 13 test failures vs 14 on master — no regressions. Type-check clean on committed code (pre-existing process-requests.ts errors unchanged).
- Gate 6: No proof phase in regular cycle (only in finalizer per loop-plan.json). QA_LOG.md provides CLI command transcript with exact outputs — human-verifiable. N/A for this gate in regular cycle.
- Gate 7: N/A — no UI changes.
- Gate 8: N/A — no dependency changes.
- Gate 9: `claude/commands/aloop/start.md` updated: documents `--mode loop`, `--mode orchestrate`, `--max <n>` → `--max-iterations <n>`, `--launch resume` for both modes. Skill correctly reflects dual-mode behavior. PASS.
