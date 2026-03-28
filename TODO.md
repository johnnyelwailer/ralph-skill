# Issue #176: OrchestratorAdapter interface and GitHubAdapter implementation

## Current Phase: Active — QA P1 bug filed (iter 13)

### In Progress

- [ ] [qa/P1] `dist/bin/loop.sh` defaults not updated after iter 12 loop.sh source fix: at HEAD 847ab1c30 `aloop/cli/dist/bin/loop.sh:31` still has `ROUND_ROBIN_PROVIDERS="claude,gemini,opencode"` and help text (line 65) says `(default: claude,codex,gemini,copilot)` — both stale. The iter 12 source fix updated `aloop/bin/loop.sh` but did not rebuild the dist artifact. A user installing the packaged CLI gets wrong round-robin defaults. Fix: run `npm run build` in `aloop/cli/` and commit updated `dist/bin/loop.sh`. Tested iter 13. (priority: high)

### Completed (iter 12)

- [x] [review] Gate 5: Fix TypeScript errors introduced by prototype mixin — resolved via interface merging (`export interface GitHubAdapter { ... }`) in `adapter-github.ts:207-217`. Zero TS errors in adapter files. Pre-existing errors in requests.ts/requests.test.ts/gh.test.ts/process-requests.ts are out of scope. (priority: high)

- [x] Revert out-of-scope changes to `orchestrate.ts`, `process-requests.ts`, and `plan.ts` (priority: critical)
  - `plan.ts`: Remove `WORKING_ARTIFACTS` export (added out-of-scope)
  - `process-requests.ts`: Revert to hardcoded artifact list and original V8 cache cleanup code
  - `orchestrate.ts`: Revert review artifact cleanup additions in `processPrLifecycle`/`monitorChildSessions` and dispatch preemption logic rewrite in `runOrchestratorScanPass`; revert `WORKING_ARTIFACTS` import
  - These changes introduced 12 orchestrate.test.ts regressions; reverting will restore the baseline
  - Constitution Rule 12: scope is `adapter.ts` + `adapter-github.ts` + `adapter.test.ts` only

- [x] Split `adapter-github.ts` (327 LOC) into `adapter-github.ts` (200 LOC) + `adapter-github-pr.ts` (137 LOC) to get both files under 300 LOC (priority: high)
  - Extracted PR methods via prototype mixin pattern: `createPr`, `mergePr`, `getPrStatus`, `getPrChecks`, `getPrComments`, `getPrReviews`, `closePr`, `getPrDiff`, `queryPrs`
  - `adapter-github.ts` keeps: constructor, issue CRUD, comments, labels, `checkBranchExists`, `fetchBulkIssueState`
  - Both files well under 300 LOC after split
  - Adapter tests pass (47/47)
  - Dist rebuilt successfully

### Completed

- [x] Reconcile `OrchestratorAdapter` interface in `adapter.ts` with TASK_SPEC.md — verified 47/47 adapter tests pass
- [x] Update `GitHubAdapter` in `adapter-github.ts` to implement corrected interface (all methods, signatures, return types)
- [x] Update tests in `adapter.test.ts` to cover corrected interface (47/47 pass)
- [x] Rebuild dist artifacts after interface fixes
- [x] Define `OrchestratorAdapter` interface in `aloop/cli/src/lib/adapter.ts`
- [x] Implement `GitHubAdapter` class in `aloop/cli/src/lib/adapter-github.ts` wrapping all `gh` CLI calls
- [x] `GitHubAdapter` derives `baseUrl` from `ghHost` config / `GH_HOST` env var — no hardcoded `github.com`
- [x] GitHub Enterprise URLs supported (`ghHost` constructor param or `GH_HOST` env)
- [x] `createAdapter` factory reads adapter type from config (default: `"github"`)
- [x] Unit tests in `adapter.test.ts` with mocked `gh` calls (38/38 pass)
- [x] Split `adapter.ts` (interface + factory, 115 LOC) from `adapter-github.ts` (implementation, 252 LOC) — both under 300 LOC threshold
- [x] Remove dead imports (`parseRepoSlug`, unused `existsSync`) from adapter files
- [x] Remove dead import of `createAdapter`/`OrchestratorAdapter` from `orchestrate.ts` and `process-requests.ts`

### Out of Scope (explicitly excluded — tracked separately)

- [~] Migrate `orchestrate.ts` to use adapter interface instead of raw `execGh` — spec file scope is `adapter.ts` + `adapter.test.ts` only; orchestrate.ts migration is a follow-on PR
- [~] `LocalAdapter` (file-based backend) — not in this issue's spec

---

## Spec-Review — 2026-03-27

### PASS gates

- AC2 GitHubAdapter wraps `gh` CLI — PASS
- AC3 No hardcoded `github.com` — `baseUrl` = `config.ghHost ?? GH_HOST ?? 'github.com'` — PASS
- AC4 `createAdapter` factory — reads `config.type`, throws for unknown — PASS
- AC5 Unit tests with mocked `gh` calls — 38/38 pass — PASS
- AC6 GHE URLs via `GH_HOST` env or `ghHost` constructor param — PASS
- LOC threshold — `adapter.ts` 115, `adapter-github.ts` 252, both under 300 — PASS

### FAIL gates — interface shape deviates from TASK_SPEC.md spec

**Missing methods (AC1):**

- [review] `getPrComments(number, since?)` absent from interface and GitHubAdapter — TASK_SPEC.md requires it
- [review] `getPrReviews(number)` absent from interface and GitHubAdapter — TASK_SPEC.md requires it

**Signature mismatches (AC1):**

- [review] `createIssue` returns `number`; spec requires `Promise<{ number: number; url: string }>`
- [review] `closeIssue(issueNumber)` drops `reason: string` parameter required by spec
- [review] `listIssues` renamed to `queryIssues`; spec names it `listIssues`
- [review] `getIssueComments(number, since?)` renamed to `listComments(issueNumber)` — `since` param dropped
- [review] `ensureLabelsExist(labels: string[])` renamed to `ensureLabelExists(label: string, opts?)` — spec requires plural form taking an array
- [review] `getPrStatus` return type: spec `{ state, mergeable, checks[] }`, impl `{ mergeable: boolean, mergeStateStatus: string }` — missing `state` field and `checks` array
- [review] `updateIssue` opts: spec requires `labelsAdd?` and `labelsRemove?` fields; impl has neither

**Required fix:** Reconcile `OrchestratorAdapter` interface in `adapter.ts` with TASK_SPEC.md spec shape, then add missing method implementations to `GitHubAdapter` and corresponding tests.

## QA Bugs — iter 9 (2026-03-27) — ALL FIXED at iter 10

QA verified all interface deviations at HEAD (b6e32bf40). All 9 bugs below were fixed at 58a94fd19 and verified by iter 10 QA (47/47 adapter tests pass):

- [x] [qa/P1] Missing `getPrComments`: `getPrComments(number, since?)` absent from `OrchestratorAdapter` interface and `GitHubAdapter` — spec AC1 requires it. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] Missing `getPrReviews`: `getPrReviews(number)` absent from `OrchestratorAdapter` interface and `GitHubAdapter` — spec AC1 requires it. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] Wrong method name `queryIssues` vs `listIssues`: interface exports `queryIssues` but TASK_SPEC.md requires `listIssues`. Confirmed via test name "queryIssues" in adapter.test.ts. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] Wrong method name `listComments` vs `getIssueComments`: interface exports `listComments(issueNumber)` but spec requires `getIssueComments(number, since?)` — also drops `since` parameter. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] Wrong method name `ensureLabelExists` vs `ensureLabelsExist`: interface exports `ensureLabelExists(label, opts?)` (singular) but spec requires `ensureLabelsExist(labels: string[])` (plural, array). Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] `createIssue` wrong return type: returns bare `number`, spec requires `Promise<{ number: number; url: string }>`. Test name confirms "returns the number" only. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] `closeIssue` missing `reason` parameter: interface drops `reason: string` — spec requires `closeIssue(number, reason: string)`. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] `getPrStatus` incomplete return type: returns `{ mergeable, mergeStateStatus }` but spec requires `{ state, mergeable, checks[] }` — `state` field and `checks` array absent. Tested iter 9. Fixed iter 10. (priority: high)
- [x] [qa/P1] `updateIssue` opts missing `labelsAdd`/`labelsRemove`: no tests for label mutation via `updateIssue`; spec requires `{ labelsAdd?: string[]; labelsRemove?: string[] }` in opts. Tested iter 9. Fixed iter 10. (priority: high)

## QA Bugs — iter 10 (2026-03-28)

New bugs found at 58a94fd19 during re-verification pass:

- [x] [qa/P1] `adapter-github.ts` exceeds 300 LOC threshold: 327 lines at HEAD — TODO.md spec gate requires both adapter files under 300 LOC. Was 252 before adding new methods; adding getPrComments, getPrReviews, ensureLabelsExist array support pushed it over. Tested iter 10. Fixed iter 10 split. (priority: high)
- [x] [qa/P1] `orchestrate.ts` regression — 12 subtest failures introduced by out-of-scope changes: `applyDecompositionPlan label enrichment` (7 subtests fail — wave/N and component/* labels not applied), `applyEstimateResults label enrichment` (4 subtests fail), `applyDecompositionPlan` (1 subtest fail). At b6e32bf40: 319 pass / 27 fail. At HEAD: 307 pass / 39 fail. TASK_SPEC.md marks orchestrate.ts migration as out-of-scope. Tested iter 10. Fixed via revert at 22df46648. Re-tested iter 11: 319 pass / 27 fail — baseline restored. (priority: high)

## Review Findings — iter 10 (2026-03-28)

- [x] [review] Gate 5/Constitution Rule 12: Revert out-of-scope changes to `orchestrate.ts`, `process-requests.ts`, `plan.ts`, and templates — builder removed `deriveComponentLabels`/`buildPrBody` calls from `orchestrate.ts` and simplified `createPrForChild`, changed dispatch preemption logic in `runOrchestratorScanPass`, added review artifact cleanup to `processPrLifecycle`/`monitorChildSessions`; removed `formatReviewCommentHistory`/`getDirectorySizeBytes` from `process-requests.ts`; added `WORKING_ARTIFACTS` export to `plan.ts`. TASK_SPEC.md file scope is `adapter.ts` + `adapter.test.ts` only; TODO.md explicitly marks orchestrate.ts migration as out-of-scope. These changes introduced 12 new orchestrate.test.ts failures. Revert all changes to files outside the spec scope. Fixed at 22df46648. (priority: critical)
- [x] [review] Gate 4/Constitution Rule 7: Split `adapter-github.ts` (327 LOC) — Constitution target is <150 LOC; prior reviews used a 300 LOC threshold; file now exceeds it at 327 lines. Extracted PR methods (`getPrStatus`, `getPrComments`, `getPrReviews`, `mergePr`, `closePr`, `getPrDiff`, `queryPrs`, `getPrChecks`) into `adapter-github-pr.ts` (137 LOC). `adapter-github.ts` is now 200 LOC. Both under 300 LOC. Fixed iter 10. (priority: high)

## Spec-Gap Analysis — 2026-03-28

### Issue #176 scope (adapter.ts + adapter-github.ts + adapter.test.ts)

All TASK_SPEC.md acceptance criteria satisfied at HEAD:
- AC1: OrchestratorAdapter interface has all required methods (createIssue, updateIssue, closeIssue, listIssues, getIssueComments, postComment, createPr, mergePr, getPrStatus, getPrComments, getPrReviews, ensureLabelsExist, syncProjectStatus?, repoSlug, baseUrl) — PASS
- AC2: GitHubAdapter implements OrchestratorAdapter wrapping `gh` CLI — PASS
- AC3: No hardcoded github.com — uses `config.ghHost ?? GH_HOST ?? 'github.com'` — PASS
- AC4: createAdapter factory uses adapter type from config (default: "github") — PASS
- AC5: 47/47 unit tests pass with mocked gh calls — PASS
- AC6: GHE URLs via ghHost constructor param or GH_HOST env — PASS

No P1 or P2 gaps in issue #176 scope.

### Pre-existing gap found outside issue #176 scope

- [x] [spec-gap/P2] `loop.sh` default round-robin provider list mismatches `config.yml` and `loop.ps1`: `loop.sh:31` defaults `ROUND_ROBIN_PROVIDERS="claude,gemini,opencode"` (3 providers — missing codex, copilot); `loop.ps1:31` defaults to all 5 `@('claude','opencode','codex','gemini','copilot')`; `config.yml:43-49` round_robin_order lists all 5. Additionally, `loop.sh:65` help text documents the default as `"claude,codex,gemini,copilot"` — a third inconsistent value (missing opencode). SPEC.md states config.yml is the single source of truth for defaults. **Files:** `aloop/bin/loop.sh:31,65`, `aloop/config.yml:43-49`, `aloop/bin/loop.ps1:31`. **Suggested fix:** Update `ROUND_ROBIN_PROVIDERS` in loop.sh to `"claude,opencode,codex,gemini,copilot"` (matching config.yml order) and update help text to match. **Note:** Pre-existing gap, unrelated to issue #176 scope; meta.json hot-reload mitigates at runtime but bare invocation without meta.json gets wrong default. Fixed at iter 12.
