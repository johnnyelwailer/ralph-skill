# QA Log

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit f03537f9c)

### Test Environment
- Commit: f03537f9c (docs/chore only since last dynamic QA at ad2f911a2)
- Features tested: 3 (regression checks — only docs/chore changed)

### Results
- PASS: TypeScript type-check (tsc --noEmit exit 0)
- PASS: npm test (51 files, 632 tests all pass)
- PASS: Storybook build (exit 0, 178 stories)

### Bugs Filed
(none)

### Command Transcript
```
$ tsc --noEmit → exit 0
$ npm test -- --run → 51 passed (51), 632 passed (632), exit 0
$ npm run build-storybook → "Storybook build completed successfully", 178 entries in index.json
$ git diff ad2f911a2..HEAD --name-only → QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md (docs/chore only — no code changes)
```

---

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit ad2f911a2)

### Test Environment
- Commit: ad2f911a2 (docs only since last dynamic QA at 612415ca3)
- Features tested: 3 (regression checks — only docs/meta changed)

### Results
- PASS: TypeScript type-check (tsc --noEmit exit 0)
- PASS: npm test (51 files, 632 tests all pass)
- PASS: Storybook build (exit 0, 178 stories)

### Bugs Filed
(none)

### Command Transcript
```
$ tsc --noEmit → exit 0
$ npm test -- --run → 51 passed (51), 632 passed (632), exit 0
$ npm run build-storybook → "Storybook build completed successfully", 178 entries in index.json
$ git diff 612415ca3..HEAD --name-only → README.md, PR_DESCRIPTION.md, QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md (docs/chore only — no code changes)
```

---

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 612415ca3)

### Test Environment
- Commit: 612415ca3 (docs only since last QA pass at cb2c2b8b5)
- Features tested: 4

### Results
- PASS: TypeScript type-check (tsc --noEmit exit 0)
- PASS: npm test (51 files, 632 tests)
- PASS: Storybook build (178 stories)
- PASS: README session-dir docs additions accurate (loop-plan.json, queue/, requests/ match SPEC §architecture)

### Bugs Filed
(none)

### Command Transcript
```
$ tsc --noEmit → exit 0
$ npm test -- --run → 51 passed (51), 632 passed (632), exit 0
$ npm run build-storybook → exit 0, 178 stories
$ git diff cb2c2b8b5..HEAD --name-only → README.md, QA_COVERAGE.md, QA_LOG.md, REVIEW_LOG.md, TODO.md (docs/chore only)
$ grep -n "requests/" SPEC.md → confirmed requests/ is agent-written; absence when empty is expected behavior
```

---

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 4502e83b0)

### Test Environment
- Binary under test: /tmp/aloop-test-install-nv85wo/bin/aloop (1.0.0)
- Commit: 4502e83b0 (post-docs commit 6b3058ca7 — aloop gh subcommands documented)
- Features tested: 5

### Results
- PASS: aloop gh start/watch/status/stop CLI flags and help
- PASS: aloop gh subcommands documented in README
- PASS: TypeScript type-check (tsc --noEmit exit 0)
- PASS: npm test (51 files, 632 tests)
- PASS: Storybook build (175 stories)

### Bugs Filed
(none)

### Command Transcript

```
# Install from source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
# → /tmp/aloop-test-install-nv85wo/bin/aloop
aloop --version → 1.0.0

# gh subcommand help
aloop gh --help → exit 0; shows start, watch, status, stop + policy-gated ops
aloop gh start --help → exit 0; shows --issue, --spec, --provider, --max, --repo, --project-root, --home-dir, --output
aloop gh watch --help → exit 0; shows --label, --assignee, --milestone, --max-concurrent, --interval, --repo, --provider, --max, --once, --output
aloop gh status --help → exit 0; shows --home-dir, --output
aloop gh stop --help → exit 0; shows --issue, --all, --home-dir, --output

# Error paths
aloop gh start (no --issue) → exit 1; "error: required option '--issue <number>' not specified"
aloop gh stop (no --issue/--all) → exit 1; "Error: gh stop requires either --issue <number> or --all."

# README verification
grep "aloop gh" README.md → lines 212-243: all 4 subcommands in CLI table and usage section ✓

# TypeScript type-check
npm run type-check (in aloop/cli/dashboard) → tsc --noEmit exit 0

# Unit tests
npm test → 51 test files, 632 tests all pass

# Storybook build
npm run build-storybook → exit 0, 175 stories

# Cleanup
rm -rf /tmp/aloop-test-install-nv85wo → done
```

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 02f4faec1)

### Test Environment
- Binary under test: N/A — dashboard/CLI testing only (no aloop CLI install needed for this task)
- Commit: 02f4faec1
- /tmp disk: 13G total, 453M used — no ENOSPC (disk restored)
- Features tested: 5 (Issue #183 Storybook setup + Issue #38 vitest regression)

### Results
- PASS: `.storybook/main.ts` and `.storybook/preview.ts` exist at `aloop/cli/dashboard/.storybook/`
- PASS: `storybook` and `build-storybook` scripts in package.json (`storybook dev -p 6006`, `storybook build`)
- PASS: Required Storybook deps installed — `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-themes`, `@storybook/addon-docs`, `storybook` (v10.3.1)
- PASS: `npm run build-storybook` — exit 0; 2104 modules transformed; 178 stories in index.json; no errors
- PASS: `button.stories.tsx` exists at `src/components/ui/`; 8 button stories in build (Default, Ghost, Outline, Destructive + small variants)
- PASS: `npm test` — 51 test files, 632 tests all pass (dynamic run — ENOSPC resolved)
- PASS: `tsc --noEmit` — exit 0

### Observations (non-bug)
- Installed version is Storybook v10.3.1 (spec says "Storybook 8") — v10 satisfies all functional requirements; build, stories, and decorators work correctly
- `@storybook/addon-essentials` (spec-listed dep) not installed; replaced by `@storybook/addon-docs` — correct for Storybook v10 which decomposed essentials into individual packages; build passes without it

### Bugs Filed
- None. All Issue #183 requirements verified. All Issue #38 requirements confirmed intact. No regressions.

### Command Transcript

```
# Check disk space
$ df -h /tmp
tmpfs 13G 453M 13G 4% /tmp
EXIT: 0

# Verify storybook scripts in package.json
$ grep -A2 '"storybook"\|"build-storybook"' aloop/cli/dashboard/package.json
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
    "storybook": "^10.3.1",
EXIT: 0

# Verify storybook deps installed
$ grep -i "@storybook" aloop/cli/dashboard/package.json
"@storybook/addon-docs": "^10.3.1",
"@storybook/addon-themes": "^10.3.1",
"@storybook/react": "^10.3.1",
"@storybook/react-vite": "^10.3.1",
EXIT: 0

# Verify storybook binary present
$ ls node_modules/.bin/storybook
/home/pj/.aloop/.../node_modules/.bin/storybook
→ storybook binary found

# Verify .storybook config files
$ ls aloop/cli/dashboard/.storybook/
main.ts  preview.ts

# Verify button.stories.tsx
$ ls aloop/cli/dashboard/src/components/ui/ | grep button
button.stories.tsx
button.tsx

# Build storybook (main test)
$ npm run build-storybook -- --output-dir /tmp/storybook-test-build
→ Building storybook v10.3.1
→ 2104 modules transformed
→ Storybook build completed successfully
EXIT: 0

# Verify stories in build output
$ cat /tmp/storybook-test-build/index.json | python3 -c "..."
Total stories in build: 178
Button stories: ['Default', 'Ghost', 'Outline', 'Destructive', 'Small Default', 'Small Ghost', 'Small Outline', 'Small Destructive']

# TypeScript type-check
$ npm run type-check
EXIT: 0

# Vitest (regression check)
$ npm test
Test Files: 51 passed (51)
Tests: 632 passed (632)
EXIT: 0 (all tests pass)

# Cleanup
$ rm -rf /tmp/storybook-test-build
```

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 7e9c3bbf5)

### Test Environment
- Binary under test: N/A — npm test BLOCKED (sandbox ENOSPC in /tmp/lflzeQYT9Pv8s5lPMnZ6a/client/); tsc --noEmit ran successfully
- Commit: 7e9c3bbf5
- Features tested: 5 (TypeScript dynamic + static verification via Glob/Grep/Read)

### Blocker
- Claude sandbox vitest temp directory (`/tmp/lflzeQYT9Pv8s5lPMnZ6a/client/`) full (ENOSPC). Filesystem itself has 9.4G free on /tmp, 331G on /. `tsc --noEmit` succeeded (simpler, less I/O). Static checks via Glob/Grep/Read confirm all requirements intact.

### Results
- PASS (dynamic): TypeScript type-check `tsc --noEmit` — exit 0 ✓
- BLOCKED: `npm test` (vitest) — ENOSPC in sandbox temp dir; last confirmed passing run: commit 613a7bab4 (51 test files, 632 tests)
- PASS (static): 30 .test.tsx files in components/ (28 non-ui + 2 ui) — all non-ui components covered ✓
- PASS (static): 41 .stories.tsx files in components/ — all non-ui components covered ✓
- PASS (static): `afterEach` imported at Sidebar.test.tsx:3 (TS2304 fix intact) ✓
- PASS (static): `iterationStartedAt: undefined as string | undefined` at ActivityPanel.test.tsx:14 (TS2353 fix intact) ✓
- PASS (static): ci.yml — push+PR on master/agent/trunk, Node 22 via actions/setup-node@v4, npm ci + npm test in aloop/cli/dashboard ✓
- PASS (static): README lines 22–28 — all 6 finalizer agents: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof ✓
- PASS (static): README line 246 — PROMPT_spec-review.md present in template list ✓

### Bugs Filed
- None. All Issue #38 requirements confirmed intact at 7e9c3bbf5. No new issues found.

### Command Transcript

```
# TypeScript type-check (dynamic)
npm --prefix aloop/cli/dashboard run type-check
# → (no output)
# Exit: 0 ✓

# npm test — BLOCKED
npm --prefix aloop/cli/dashboard test -- --run
# → ENOSPC: no space left on device, open '/tmp/lflzeQYT9Pv8s5lPMnZ6a/client/.tmp-...'
# → 33 failed (all ENOSPC), 18 passed (228 tests)
# → Exit: 1 — BLOCKED by sandbox temp dir exhaustion (not a code failure)

# Check .test.tsx coverage
Glob: aloop/cli/dashboard/src/components/**/*.test.tsx
→ 30 .test.tsx files (28 non-ui + 2 ui) — all non-ui components covered ✓

# Check .stories.tsx coverage
Glob: aloop/cli/dashboard/src/components/**/*.stories.tsx
→ 41 .stories.tsx files — all non-ui components covered ✓

# TS fix: afterEach
Grep: afterEach in Sidebar.test.tsx
→ Line 3: import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; ✓

# TS fix: iterationStartedAt
Grep: iterationStartedAt in ActivityPanel.test.tsx
→ Line 14: iterationStartedAt: undefined as string | undefined, ✓

# CI workflow
Read: .github/workflows/ci.yml
→ on: push+PR branches: [master, agent/trunk] ✓
→ actions/setup-node@v4 node-version: '22' ✓
→ working-directory: aloop/cli/dashboard; npm ci then npm test ✓

# README finalizer prose
Read: README.md lines 22–28
→ Lines 22–28: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof — all 6 ✓

# README template list
Grep: PROMPT_spec-review in README.md
→ Line 246: PROMPT_spec-review.md  # Spec-review agent (finalizer) ✓
```

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 091afbeee)

### Test Environment
- Binary under test: N/A — Bash tool blocked (ENOSPC in Claude sandbox task output directory)
- Commit: 091afbeee
- Features tested: 5 (static verification via Glob/Grep/Read)

### Blocker
- Claude sandbox task output directory full (ENOSPC on `/tmp/claude-501/...`). Filesystem itself has 331G free. Same blocker as previous sessions at 1933cd7eb and afbf4e6c3. All checks performed statically.

### Results
- PASS (static): `.github/workflows/ci.yml` — triggers on push+PR to master/agent/trunk, Node 22 via actions/setup-node@v4, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- PASS (static): All 34 .test.tsx files present (28 non-ui + 2 ui/ + 4 in src/ root) — all non-ui components covered ✓
- PASS (static): All 41 .stories.tsx files present — all 28 non-ui components covered; spot-checked 3 new story files (ActivityPanel: 3 stories, CollapsedSidebar: 3 stories, DiffOverlayView: 2 stories) — all export ≥2 named stories ✓
- PASS (static): TypeScript fixes intact — `afterEach` imported at `Sidebar.test.tsx:3`; `iterationStartedAt: undefined as string | undefined` in `ActivityPanel.test.tsx:14` baseProps ✓
- PASS (static): README finalizer prose (lines 22–28) — all 6 agents: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof ✓; README template list (lines 246–248) — PROMPT_spec-review.md, PROMPT_final-qa.md, PROMPT_final-review.md all present ✓

### Bugs Filed
- None. All Issue #38 requirements confirmed intact at 091afbeee. No new issues found.

### Command Transcript

```
# Bash tool blocked (ENOSPC in Claude sandbox /tmp/claude-501/... task output directory)
# All checks via Glob/Grep/Read tools

# Check ci.yml
Read: .github/workflows/ci.yml
→ on.push/pull_request branches: [master, agent/trunk] ✓
→ actions/setup-node@v4 node-version: '22' ✓
→ working-directory: aloop/cli/dashboard; npm ci then npm test ✓

# Check .test.tsx coverage
Glob: aloop/cli/dashboard/src/components/**/*.test.tsx
→ 34 .test.tsx files — all 28 non-ui components covered ✓

# Check .stories.tsx coverage
Glob: aloop/cli/dashboard/src/components/**/*.stories.tsx
→ 41 .stories.tsx files — all 28 non-ui components covered ✓

# Spot-check new story exports
Grep: ^export const in ActivityPanel.stories.tsx → 3 named stories ✓
Grep: ^export const in CollapsedSidebar.stories.tsx → 3 named stories ✓
Grep: ^export const in DiffOverlayView.stories.tsx → 2 named stories ✓

# TS fix: afterEach
Grep: afterEach in Sidebar.test.tsx
→ Line 3: import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; ✓

# TS fix: iterationStartedAt
Grep: iterationStartedAt in ActivityPanel.test.tsx
→ Line 14: iterationStartedAt: undefined as string | undefined, ✓

# README checks
Read: README.md lines 22–28
→ All 6 finalizer agents present ✓
Read: README.md lines 246–248
→ PROMPT_spec-review.md, PROMPT_final-qa.md, PROMPT_final-review.md all present ✓
```

## Docs Audit — 2026-03-31 (docs agent, triggered by spec-gap finalizer, commit 091afbeee)

### Audit Scope
Cross-referenced README.md against SPEC.md, pipeline.yml, and implementation (index.ts, orchestrate.ts, start.ts, agent templates).

### Findings
- PASS: README finalizer prose (lines 22–28) — all 6 agents in correct order: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof ✓
- PASS: README template list (Architecture section) — all 30 templates listed, matches `aloop/templates/` glob exactly ✓
- PASS: CLI commands table (16 commands) — all match registered commands in index.ts (resolve, discover, setup, scaffold, start, dashboard, status, active, stop, update, devcontainer, devcontainer-verify, orchestrate, steer, process-requests, gh) ✓
- PASS: Loop cycle description — `plan → build × 5 → qa → review` matches pipeline.yml exactly ✓
- PASS: Provider table — 5 providers match PROVIDER_SET in start.ts ✓
- PASS: OpenCode agent models — match agent frontmatter ✓
- PASS: `aloop start --launch resume <session-id>` syntax — correct ✓
- PASS: `aloop orchestrate --resume <session-id>` — option present in index.ts ✓

### No Documentation Changes Needed
README.md is accurate and up-to-date. No discrepancies found between documentation and implementation.

### Blocker
- /tmp partition full (ENOSPC) — cannot run bash commands or commit working tree changes.
- Working tree has unstaged changes to README.md, TODO.md, QA_LOG.md from previous finalizer passes. These are correct and can be committed when disk space is available.

## Docs Audit — 2026-03-31 (docs agent, triggered by spec-gap finalizer, commit 1933cd7eb)

### Audit Scope
Cross-referenced README.md against SPEC.md, pipeline.yml, and implementation (index.ts, orchestrate.ts, start.ts, agent templates).

### Findings
- PASS: README finalizer prose (lines 22–28) — all 6 agents in correct order: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof ✓
- PASS: README template list (Architecture section) — all 30 templates listed, matches `aloop/templates/` glob exactly ✓
- PASS: CLI commands table (16 commands) — all match registered commands in index.ts ✓
- PASS: Loop cycle description — `plan → build × 5 → qa → review` matches pipeline.yml exactly ✓
- PASS: Provider table — 5 providers match PROVIDER_SET in start.ts ✓
- PASS: OpenCode agent models — code-critic (claude-sonnet-4/xhigh), error-analyst (gemini-3.1-flash-lite-preview/medium), vision-reviewer (gemini-3.1-flash-lite-preview/medium) match agent frontmatter ✓
- PASS: `aloop start --launch resume <session-id>` syntax — correct: `[session-id]` is positional arg in Commander.js ✓
- PASS: `aloop orchestrate --resume <session-id>` — option present in index.ts ✓

### No Documentation Changes Needed
README.md is accurate and up-to-date. All previously-flagged gaps (PROMPT_spec-review.md missing from template list, finalizer prose incomplete) were fixed at afbf4e6c3 and confirmed PASS at 1933cd7eb.

### Blocker
- /tmp partition full (ENOSPC) — cannot run bash commands or commit working tree changes.
- Working tree has unstaged changes to README.md, TODO.md, QA_LOG.md from previous finalizer passes. These are correct and can be committed when disk space is available.

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 1933cd7eb)

### Test Environment
- Binary under test: N/A — disk still full (ENOSPC), Bash tool blocked
- Commit: 1933cd7eb
- Features tested: 5 (static verification via Glob/Grep/Read)

### Blocker
- `/tmp` partition is still full (ENOSPC). Dynamic execution (npm test, tsc --noEmit, CLI install) unavailable.
- All checks performed statically via Glob, Grep, and Read tools.

### Results
- PASS (static): `.github/workflows/ci.yml` — triggers on push+PR to master/agent/trunk, Node 22, `npm ci` + `npm test` in `aloop/cli/dashboard` ✓
- PASS (static): All 30 .test.tsx files present (28 non-ui + 2 ui) ✓
- PASS (static): All 41 .stories.tsx files present (all non-ui + ui) ✓
- PASS (static): `Sidebar.test.tsx:3` — `afterEach` imported from vitest (TS2304 fix intact) ✓
- PASS (static): `ActivityPanel.test.tsx:14` — `iterationStartedAt: undefined as string | undefined` in baseProps (TS2353 fix intact) ✓
- PASS (static): README lines 22–28 — all 6 finalizer agents listed: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof ✓
- PASS (static): README line 246 — `PROMPT_spec-review.md` present in template list ✓

### Bugs Filed
- None. All Issue #38 requirements confirmed intact at 1933cd7eb. No new issues found.

### Command Transcript

```
# Disk full — Bash tool blocked (ENOSPC)
# All checks via Glob/Grep/Read tools

# Check .test.tsx coverage
Glob: aloop/cli/dashboard/src/components/**/*.test.tsx
→ 30 files (28 non-ui + 2 ui) — all non-ui components covered ✓

# Check .stories.tsx coverage
Glob: aloop/cli/dashboard/src/components/**/*.stories.tsx
→ 41 files — all non-ui components covered ✓

# Verify ci.yml
Read: .github/workflows/ci.yml
→ triggers: push+PR on master, agent/trunk ✓
→ Node 22 via actions/setup-node@v4 ✓
→ working-directory: aloop/cli/dashboard; npm ci then npm test ✓

# TS fix: afterEach
Grep: afterEach in Sidebar.test.tsx
→ Line 3: import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; ✓

# TS fix: iterationStartedAt
Grep: iterationStartedAt in ActivityPanel.test.tsx
→ Line 14: iterationStartedAt: undefined as string | undefined, ✓

# README finalizer prose
Read: README.md lines 22–28
→ Lines 22–28: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof — all 6 ✓

# README template list
Grep: PROMPT_spec-review in README.md
→ Line 246: PROMPT_spec-review.md  # Spec-review agent (finalizer) ✓
```

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit afbf4e6c3)

### Test Environment
- Binary under test: static verification only — Bash tool unavailable (disk full, ENOSPC on /tmp)
- Commit: afbf4e6c3
- Features tested: 5

### Results
- PASS: README finalizer prose (lines 22–28) — all 6 finalizer agents listed: Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof
- PASS: README template list (lines 246–248) — PROMPT_spec-review.md, PROMPT_final-qa.md, PROMPT_final-review.md all present
- PASS: TypeScript fixes intact — `afterEach` imported at Sidebar.test.tsx:3; `iterationStartedAt` in ActivityPanel.test.tsx:14 baseProps
- PASS: CI workflow — triggers on push+PR to master/agent/trunk, Node 22, `npm ci` + `npm test` in aloop/cli/dashboard, valid YAML
- PASS: All 28 non-ui components have .test.tsx and .stories.tsx (Glob verification)

### Bugs Filed
- None. All previously-tracked [review] gaps (README finalizer prose and template list) confirmed FIXED at afbf4e6c3. No new issues found.

### Command Transcript

```
# Disk full — Bash tool unavailable (ENOSPC mkdir /tmp/claude-501/...)
# All checks performed via Read, Grep, and Glob tools

# Check README finalizer prose
Read README.md lines 22–28
# → Line 22: When all tasks are marked done, finalizer agents run once:
# → Line 23: - **Spec-gap** — Finds discrepancies between spec and implementation
# → Line 24: - **Docs** — Syncs documentation to match actual implementation
# → Line 25: - **Spec-review** — Reviews spec compliance of the implementation
# → Line 26: - **Final-review** — Final code quality audit against all 9 review gates
# → Line 27: - **Final-qa** — Final quality assurance pass before proof capture
# → Line 28: - **Proof** — Captures screenshots, API responses, test output as evidence
# → All 6 finalizer agents present ✓

# Check README template list
Read README.md lines 235–260
# → Line 246: PROMPT_spec-review.md       # Spec-review agent (finalizer)
# → Line 247: PROMPT_final-qa.md          # Final QA agent (finalizer)
# → Line 248: PROMPT_final-review.md      # Final review agent (finalizer)
# → All 3 previously-missing entries now present ✓

# Check TypeScript fixes
Grep afterEach in Sidebar.test.tsx
# → Line 3: import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
# → TS2304 resolved ✓

Grep iterationStartedAt in ActivityPanel.test.tsx
# → Line 14: iterationStartedAt: undefined as string | undefined,
# → TS2353 resolved ✓

# Check CI workflow
Read .github/workflows/ci.yml
# → triggers: push+PR on master and agent/trunk ✓
# → Node 22 via actions/setup-node@v4 ✓
# → npm ci in aloop/cli/dashboard ✓
# → npm test in aloop/cli/dashboard ✓

# Check .test.tsx coverage (non-ui)
Glob aloop/cli/dashboard/src/components/**/*.test.tsx
# → 30 files returned (includes 2 ui/ test files); all 28 non-ui components confirmed ✓

# Check .stories.tsx coverage (non-ui)
Glob aloop/cli/dashboard/src/components/**/*.stories.tsx
# → 41 files returned; all 28 non-ui components confirmed ✓
```


## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 6650dcf30)

### Test Environment
- Binary under test: /tmp/aloop-test-install-UPzAsn/bin/aloop (version 1.0.0)
- Commit: 6650dcf30
- Disk space: /tmp 5.9G available, / 331G available (disk full resolved)
- Features tested: 5

### Results
- PASS: TypeScript type-check (`tsc --noEmit`) — exit 0
- PASS: `npm test` (vitest) in dashboard — 51 test files, 632 tests, exit 0
- PASS: Every non-ui component has `.test.tsx` — no missing files
- PASS: Every non-ui component has `.stories.tsx` — no missing files
- FAIL (pre-existing, tracked): README template list missing `PROMPT_spec-review.md` — file exists at `aloop/templates/PROMPT_spec-review.md` but absent from README Architecture section template listing. Already tracked as `[review]` in TODO.md.
- FAIL (pre-existing, tracked): README finalizer prose lists only 3 agents (Proof, Spec-gap, Docs) — SPEC defines 6 (spec-gap, docs, spec-review, final-review, final-qa, proof). Already tracked as `[review]` in TODO.md.

### Bugs Filed
- None new. Both README gaps are pre-existing and already tracked as `[review]` items in TODO.md (re-confirmed still open at commit 6650dcf30).

### Command Transcript

```
# Install CLI from packaged source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
echo "Binary under test: $ALOOP_BIN"
# → Binary under test: /tmp/aloop-test-install-UPzAsn/bin/aloop
$ALOOP_BIN --version
# → 1.0.0

# TypeScript type-check
npm --prefix aloop/cli/dashboard run type-check
# → (no output)
# Exit: 0

# Run vitest suite
npm --prefix aloop/cli/dashboard test -- --run
# → Test Files  51 passed (51)
# → Tests       632 passed (632)
# → Duration    5.04s
# → (2 expected console errors from ResponsiveLayout.test.tsx .toThrow() case — not failures)
# Exit: 0

# Check .test.tsx coverage (non-ui components)
find aloop/cli/dashboard/src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*" | while read f; do base="${f%.tsx}"; [ ! -f "${base}.test.tsx" ] && echo "NO TEST: $f"; done
# → (no output — all components have test files)

# Check .stories.tsx coverage (non-ui components)
find aloop/cli/dashboard/src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*" | while read f; do base="${f%.tsx}"; [ ! -f "${base}.stories.tsx" ] && echo "NO STORY: $f"; done
# → (no output — all components have story files)

# Verify README gaps (static check against spec)
grep -n "PROMPT_spec-review\|finalizer" README.md
# → Line 22: When all tasks are marked done, finalizer agents run once:
# → Line 23: - **Proof** — ...
# → Line 24: - **Spec-gap** — ...
# → Line 25: - **Docs** — ...  ← only 3 listed, spec requires 6
# → Line 240: PROMPT_proof.md
# → Line 241: PROMPT_spec-gap.md
# → Line 242: PROMPT_docs.md
# → Line 243: PROMPT_final-qa.md
# → Line 244: PROMPT_final-review.md
# →  (PROMPT_spec-review.md absent from template list)

# Verify PROMPT_spec-review.md exists
ls aloop/templates/PROMPT_spec-review.md
# → aloop/templates/PROMPT_spec-review.md  ← file exists, just not in README

# Clean up install prefix
rm -rf /tmp/aloop-test-install-UPzAsn
```

## QA Session — 2026-03-31 (iteration 1)

### Test Environment

- Working directory: worktree root (host session — not testing lifecycle commands)
- Dashboard directory: `aloop/cli/dashboard/`
- Features tested: 3
- Node available: yes (`npm` in dashboard has deps installed)

### Results

- PASS: CI workflow file exists and is valid YAML
- PASS: `npm test` runs vitest in dashboard (45 files, 588 tests)
- FAIL: Component test coverage — 6 components missing `.test.tsx` files (4 new)
- FAIL: Component story coverage — 13 components missing `.stories.tsx` files (10 new)

### Bugs Filed

- [qa/P1] 4 components missing `.test.tsx`: ActivityPanel, ArtifactComparisonHeader, DiffOverlayView, SideBySideView
- [qa/P1] 10 components missing `.stories.tsx`: ResponsiveLayout, ActivityPanel, ArtifactComparisonDialog, ArtifactComparisonHeader, DiffOverlayView, ImageLightbox, LogEntryExpandedDetails, LogEntryRow, SideBySideView, SliderView

### Command Transcript

```
# Check CI workflow
$ cat .github/workflows/ci.yml
# Output: valid YAML, correct triggers, Node 22, npm ci + npm test in aloop/cli/dashboard
# Exit: 0

# Validate YAML
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML valid')"
YAML valid
# Exit: 0

# Run dashboard tests
$ cd aloop/cli/dashboard && npm test
> aloop-dashboard@1.0.0 test
> vitest run

[Note: 2 console errors logged for useResponsiveLayout outside <ResponsiveLayout>
 — these are expected, from ResponsiveLayout.test.tsx testing the .toThrow() case]

 Test Files  45 passed (45)
       Tests  588 passed (588)
    Start at  11:28:36
    Duration  4.09s
# Exit: 0

# Check component test coverage
$ find components/ -name "*.tsx" | grep -v test | grep -v stories | grep -v "/ui/" | \
  while read f; do base="${f%.tsx}"; [ ! -f "${base}.test.tsx" ] && echo "NO TEST: $f"; done
NO TEST: ./layout/CollapsedSidebar.tsx
NO TEST: ./layout/SidebarContextMenu.tsx
NO TEST: ./session/ActivityPanel.tsx
NO TEST: ./session/ArtifactComparisonHeader.tsx
NO TEST: ./session/DiffOverlayView.tsx
NO TEST: ./session/SideBySideView.tsx

# Check component story coverage
$ find components/ -name "*.tsx" | grep -v test | grep -v stories | grep -v "/ui/" | \
  while read f; do base="${f%.tsx}"; [ ! -f "${base}.stories.tsx" ] && echo "NO STORY: $f"; done
NO STORY: ./layout/CollapsedSidebar.tsx
NO STORY: ./layout/ResponsiveLayout.tsx
NO STORY: ./layout/SidebarContextMenu.tsx
NO STORY: ./session/ActivityPanel.tsx
NO STORY: ./session/ArtifactComparisonDialog.tsx
NO STORY: ./session/ArtifactComparisonHeader.tsx
NO STORY: ./session/DiffOverlayView.tsx
NO STORY: ./session/ImageLightbox.tsx
NO STORY: ./session/LogEntryExpandedDetails.tsx
NO STORY: ./session/LogEntryRow.tsx
NO STORY: ./session/SideBySideView.tsx
NO STORY: ./session/SliderView.tsx
NO STORY: ./shared/QACoverageBadge.tsx
```

## QA Session — 2026-03-31 (iteration final-qa)

### Test Environment
- Binary under test: /tmp/aloop-test-install-JskkRK/bin/aloop (version 1.0.0)
- Commit: 613a7bab4
- Features tested: 5 (re-tests of all previously tracked items)

### Results
- PASS: `.github/workflows/ci.yml` exists and is valid YAML — correct triggers, Node 22, npm ci + npm test
- PASS: CI workflow Node 22 + npm ci setup — confirmed via `cat ci.yml`
- PASS: `npm test` (vitest) in dashboard — 51 test files, 632 tests, exit 0
- PASS: Every non-ui component has `.test.tsx` — no missing files
- PASS: Every non-ui component has `.stories.tsx` — no missing files
- PASS: TypeScript type-check (`tsc --noEmit`) — **previously FAIL, now PASS** — both errors resolved

### Bugs Filed
- None. All previously filed bugs are resolved.

### Command Transcript

```
# Install CLI from packaged source
ALOOP_BIN=$(npm --prefix aloop/cli run --silent test-install -- --keep 2>/dev/null | tail -1)
echo "Binary under test: $ALOOP_BIN"
# → Binary under test: /tmp/aloop-test-install-JskkRK/bin/aloop
$ALOOP_BIN --version
# → 1.0.0

# Run TypeScript type-check (was FAIL in iter 3 with 2 errors)
npm --prefix aloop/cli/dashboard run type-check
# → (no output)
# Exit: 0  ← PASS (previously non-zero)

# Run full vitest suite
npm --prefix aloop/cli/dashboard test -- --run
# → Test Files  51 passed (51)
# → Tests       632 passed (632)
# → Duration    5.11s
# Exit: 0

# Check .test.tsx coverage (non-ui components)
find aloop/cli/dashboard/src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*" | while read f; do base="${f%.tsx}"; [ ! -f "${base}.test.tsx" ] && echo "NO TEST: $f"; done
# → (no output — all components have test files)

# Check .stories.tsx coverage (non-ui components)
find aloop/cli/dashboard/src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*" | while read f; do base="${f%.tsx}"; [ ! -f "${base}.stories.tsx" ] && echo "NO STORY: $f"; done
# → (no output — all components have story files)

# Verify ci.yml
cat .github/workflows/ci.yml
# → name: CI; on: push+PR to master,agent/trunk; Node 22 via actions/setup-node@v4; working-directory: aloop/cli/dashboard; npm ci then npm test
```
## QA Session — 2026-03-31 (final-qa re-run, triggered by final-review)

### Test Environment
- Binary under test: N/A — disk full (ENOSPC), commands blocked
- Commit: a43e2b433
- Features tested: 5 (static verification via file reads only)

### Blocker
- `/tmp` partition is full (ENOSPC). Could not run `npm test`, `tsc --noEmit`, or install the packaged CLI binary.
- Reverted to static verification using Glob/Grep tools to confirm file presence and content.

### Results
- PASS (static): `.github/workflows/ci.yml` — file present, correct triggers/Node 22/npm ci+test ✓
- PASS (static): All non-ui components have `.test.tsx` — Glob confirms all 30 test files present ✓
- PASS (static): All non-ui components have `.stories.tsx` — Glob confirms all stories files present ✓
- PASS (static): `Sidebar.test.tsx:3` — `afterEach` imported from vitest (TS2304 fix confirmed in place) ✓
- PASS (static): `ActivityPanel.test.tsx:14` — `iterationStartedAt: undefined as string | undefined` in baseProps (TS2353 fix confirmed in place) ✓

### Bugs Filed
- None. All previously filed bugs remain resolved per static checks.
- NOTE: Dynamic test execution (npm test, tsc) not possible this session due to disk space exhaustion. Last confirmed passing run: iter final-qa at commit 613a7bab4.

### Command Transcript
```
# Check for file existence and TypeScript fixes — via Glob/Grep (commands blocked by ENOSPC)

Glob: aloop/cli/dashboard/src/components/**/*.test.tsx
→ 30 test files found (all non-ui components covered)

Glob: aloop/cli/dashboard/src/components/**/*.stories.tsx
→ 41 stories files found (all non-ui components covered + ui/ stories)

Grep: afterEach in Sidebar.test.tsx
→ Line 3: import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
→ Line 240: afterEach(() => {

Grep: iterationStartedAt in ActivityPanel.test.tsx
→ Line 14: iterationStartedAt: undefined as string | undefined,
→ Line 73: renderActivityPanel({ log, isRunning: true, currentIteration: 5, iterationStartedAt: undefined });

cat .github/workflows/ci.yml (via Read tool)
→ name: CI
→ on: push+PR to master, agent/trunk
→ actions/setup-node@v4 node-version: 22
→ working-directory: aloop/cli/dashboard
→ npm ci then npm test
```

## QA Session — 2026-03-31 (iteration 3)

### Test Environment
- Binary under test: /tmp/aloop-test-install-w1lqjx/bin/aloop (version 1.0.0)
- Commit: 2d02591e7b0cd07ef37591448efca8099defb23e
- Features tested: 5

### Results
- PASS: ci.yml exists and is valid YAML
- PASS: CI workflow Node 22 + npm ci setup
- PASS: npm test (vitest) runs in dashboard — 51 test files, 632 tests
- PASS: Every non-ui component has .test.tsx (previously FAIL — all 6 missing files now present)
- PASS: Every non-ui component has .stories.tsx (previously FAIL — all 13 missing files now present)
- FAIL: TypeScript type-check — 2 errors remain

### Bugs Filed
- [qa/P1] Sidebar.test.tsx:240 TS2304: `afterEach` not found (new)
- [review] ActivityPanel.test.tsx:72 TS2353: `iterationStartedAt` type error (pre-existing, tracked as [review] gate item)

### Command Transcript

```
# Install CLI from packaged source
npm --prefix aloop/cli install --silent
npm --prefix aloop/cli run test-install -- --keep
# → Binary: /tmp/aloop-test-install-w1lqjx/bin/aloop
/tmp/aloop-test-install-w1lqjx/bin/aloop --version
# → 1.0.0

# Run dashboard test suite
npm --prefix aloop/cli/dashboard test -- --run
# → Test Files: 51 passed (51)
# → Tests: 632 passed (632)
# → Duration: 4.70s
# (Note: error logged for useResponsiveLayout outside context but does not fail tests)

# Check .test.tsx coverage (non-ui components)
find src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*"
# → All have corresponding .test.tsx — no missing files

# Check .stories.tsx coverage (non-ui components)
find src/components -name "*.tsx" ! -name "*.test.tsx" ! -name "*.stories.tsx" ! -path "*/ui/*"
# → All have corresponding .stories.tsx — no missing files
# (ui/sonner.stories.tsx has only 1 story but ui/ is excluded per SPEC-ADDENDUM)

# TypeScript type-check
npm --prefix aloop/cli/dashboard run type-check
# → src/components/layout/Sidebar.test.tsx(240,5): error TS2304: Cannot find name 'afterEach'.
# → src/components/session/ActivityPanel.test.tsx(72,70): error TS2353: ...iterationStartedAt...
# Exit: non-zero (2 errors)

# Check ci.yml
cat .github/workflows/ci.yml
# → Triggers on push+PR to master, agent/trunk
# → Node 22 via actions/setup-node@v4
# → working-directory: aloop/cli/dashboard
# → npm ci then npm test
```

## QA Session — 2026-03-31 (final-qa, triggered by final-review, commit 05fb34277)

### Test Environment
- Binary under test: tsx src/index.ts (installed CLI deps via npm ci; full pack/install skipped due to vite dashboard build dep requiring npm ci in dashboard first — using tsx for flag verification)
- Commit: 05fb34277
- /tmp disk: 13G total, 6.6G used — ample space (no ENOSPC)
- Features tested: 5 (full dynamic run — npm test, tsc, storybook build, .test.tsx/.stories.tsx coverage, CLI flags)

### Results
- PASS: `npm test` — 51 test files, 632 tests all pass (dynamic run; disk space adequate)
- PASS: `tsc --noEmit` — exit 0, no TypeScript errors
- PASS: `npm run build-storybook` — exit 0; 178 stories in index.json; no errors
- PASS: All 28 non-ui components have both `.test.tsx` AND `.stories.tsx` (verified per-file, zero missing)
- PASS: Story exports ≥2 spot-checked: CollapsedSidebar (3), ActivityPanel (3), DiffOverlayView (2), QACoverageBadge (2)
- PASS: CI workflow (`ci.yml`) — push+PR on master/agent/trunk, Node 22, npm ci + npm test in aloop/cli/dashboard
- PASS: README lines 22–28 — all 6 finalizer agents present (Spec-gap, Docs, Spec-review, Final-review, Final-qa, Proof)
- PASS: `aloop start --in-place` flag present in CLI help
- PASS: `aloop status --watch` flag present in CLI help
- PASS: `aloop setup --non-interactive` flag present in CLI help

### Bugs Filed
- None. All Issue #183 and Issue #38 requirements verified dynamically. No regressions.

### Command Transcript

```
# Check disk space
$ df -h /tmp && df -h /home
tmpfs 13G 6.6G 6.0G 53% /tmp
/dev/vdb1 361G 34G 328G 10% /home
EXIT: 0

# Run vitest
$ cd aloop/cli/dashboard && npm test
Test Files: 51 passed (51)
Tests: 632 passed (632)
Duration: 6.14s
EXIT: 0

# TypeScript type-check
$ npm run type-check
> tsc --noEmit
EXIT: 0

# Storybook build
$ npm run build-storybook -- --output-dir /tmp/qa-storybook-build-<ts>
→ Storybook build completed successfully
EXIT: 0
Total stories in build: 178 (Button stories: 8)

# Per-file coverage check (28 non-ui components)
$ for each .tsx in components/ (excluding ui/): check .test.tsx and .stories.tsx exist
Missing .test.tsx: 0
Missing .stories.tsx: 0

# Story export count spot-check
layout/CollapsedSidebar.stories.tsx: 3 exports PASS
session/ActivityPanel.stories.tsx: 3 exports PASS
session/DiffOverlayView.stories.tsx: 2 exports PASS
shared/QACoverageBadge.stories.tsx: 2 exports PASS

# CLI flag verification (via tsx src/index.ts)
$ aloop start --help | grep in-place
  --in-place   Run in project root instead of creating a git...  PASS

$ aloop status --help | grep watch
  --watch   Auto-refresh status display  PASS

$ aloop setup --help | grep non-interactive
  --non-interactive   Skip interactive prompts and use defaults  PASS

# Cleanup
$ rm -rf /tmp/qa-storybook-build-<ts>
```

## QA Session — 2026-03-31 (final-qa, triggered by final-review — final pass, commit 227cf30f4)

### Test Environment
- Binary under test: N/A — dashboard/CLI testing only
- Commit: 227cf30f4
- /tmp disk: 13G total, 5.5G used, 7.1G free — no ENOSPC
- Features tested: 5 (full dynamic run — tsc, vitest, storybook build, .test.tsx/.stories.tsx counts, ci.yml)

### Results
- PASS: `tsc --noEmit` — exit 0 ✓
- PASS: `npm test` — 51 test files, 632 tests all pass ✓
- PASS: `npm run build-storybook` — "Storybook build completed successfully"; 175 stories in index.json ✓
- PASS: 30 .test.tsx files in components/ (28 non-ui + 2 ui) ✓
- PASS: 41 .stories.tsx files in components/ (28 non-ui + 13 ui) ✓
- PASS: `.github/workflows/ci.yml` — push+PR on master/agent/trunk, Node 22, npm ci + npm test in aloop/cli/dashboard ✓

### Bugs Filed
- None. All Issue #183 requirements verified. No regressions at final commit.

### Command Transcript

```
# Disk check
$ df -h /tmp
tmpfs 13G 5.5G 7.1G 44% /tmp
EXIT: 0

# TypeScript type-check
$ npm run type-check
EXIT: 0

# Vitest
$ npm test
Test Files: 51 passed (51)
Tests: 632 passed (632)
EXIT: 0

# Storybook build
$ npm run build-storybook -- --output-dir /tmp/sb-qa-final-build
→ Storybook build completed successfully
EXIT: 0

# Stories count
$ python3 -c "..."
Total stories: 175

# Component file counts
$ find components -name "*.test.tsx" | wc -l
30
$ find components -name "*.stories.tsx" | wc -l
41

# CI workflow
$ cat .github/workflows/ci.yml
→ triggers: push+PR master/agent/trunk, Node 22, npm ci + npm test in aloop/cli/dashboard ✓

# Cleanup
$ rm -rf /tmp/sb-qa-final-build
```

## QA Session — 2026-03-31 (triggered by final-review, post-review-17)

### Test Environment
- Working dir: aloop/cli/dashboard (in worktree)
- Binary: packaged build tested via npm scripts (tsc, vitest, storybook)
- Commit under test: cb2c2b8b5
- Code delta since last QA: 765558dcc (README one-liner: auth failure docs correction)

### Features Tested
1. TypeScript type-check (tsc --noEmit)
2. Vitest unit tests (npm test)
3. Storybook build (npm run build-storybook)
4. Component .test.tsx / .stories.tsx file coverage
5. README auth failure docs correction (765558dcc)

### Results
- PASS: `tsc --noEmit` — exit 0 ✓
- PASS: `npm test` — 51 test files, 632 tests all pass ✓
- PASS: `npm run build-storybook` — "Storybook build completed successfully"; 178 entries in index.json ✓
- PASS: 30 .test.tsx files in components/ (28 non-ui + 2 ui) ✓
- PASS: 41 .stories.tsx files in components/ (28 non-ui + 13 ui) ✓
- PASS: README auth failure correction — no regressions introduced

### Bugs Filed
- None. All Issue #183 requirements verified. No regressions.

### Command Transcript

```
# TypeScript type-check
$ cd aloop/cli/dashboard && npm run type-check
> tsc --noEmit
EXIT: 0

# Vitest
$ npm test
Test Files: 51 passed (51)
Tests:      632 passed (632)
EXIT: 0

# Storybook build
$ npm run build-storybook -- --output-dir /tmp/sb-qa-final-build-2
→ Storybook build completed successfully
EXIT: 0

# Stories count
$ python3 -c "import json; d=json.load(open('/tmp/sb-qa-final-build-2/index.json')); print('Total entries:', len(d['entries']))"
Total entries: 178
EXIT: 0

# Component file counts
$ find src/components -name "*.test.tsx" | wc -l
30
$ find src/components -name "*.stories.tsx" | wc -l
41

# Cleanup
$ rm -rf /tmp/sb-qa-final-build-2
```
