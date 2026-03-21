# Issue #166: Review agent must read PR comment history and only re-review on new commits

## Current Phase: Bug fixes (QA + Review consolidated)

### In Progress

_(none — ready for next task)_

- [x] **Fix scan loop premature skip** — Removed the scan loop SHA check that was doing `continue` and skipping the entire PR lifecycle. SHA dedup is now handled solely by `invokeAgentReview` in `process-requests.ts`, which correctly reads result files before checking SHA. (priority: critical)

- [ ] **Fix premature SHA storage in invokeAgentReview** — `process-requests.ts:477` stores `last_reviewed_sha` immediately when queuing a review (before the agent even runs). If the agent crashes or the queue file is lost, this SHA blocks future reviews. Fix: only store `last_reviewed_sha` after a non-pending verdict is returned (i.e., move it to the result-reading path or to the post-lifecycle code in the scan loop). (priority: critical)

- [ ] **Enrich PR comment history with author/timestamp** — `process-requests.ts:493-502` fetches only `.comments[].body` via `--jq`. The review agent can't distinguish its own prior feedback from the child loop's responses, making conversation-aware reviews impossible. Fix: fetch `.comments[] | {author: .author.login, createdAt: .createdAt, body: .body}` and format as a threaded conversation with attribution. (priority: high)

- [ ] **Update review prompt for conversation-aware verdicts** — `PROMPT_orch_review.md` has no instructions about comparing against prior feedback or acknowledging fixes. Add instructions: (1) compare current diff against previous review feedback, (2) note which previously-requested changes are now fixed, (3) only flag remaining/new issues, (4) produce a delta-style verdict like "X and Y fixed, Z still needs work". (priority: high)

- [ ] **Add review fields to OrchestratorIssue interface** — `last_reviewed_sha`, `last_review_comment`, `needs_redispatch`, `review_feedback` are all accessed via `(issue as any)` casts in `orchestrate.ts` and `process-requests.ts`. Add these to the `OrchestratorIssue` interface at `orchestrate.ts:69-91` for type safety and discoverability. (priority: medium)

- [ ] **Add tests for review dedup and conversation-aware behavior** — Cover: (1) SHA gating — review skipped when head hasn't changed, (2) SHA not stored on pending verdict, (3) result file still read even when SHA matches, (4) comment history included in queued prompt with author attribution, (5) re-dispatch clears `last_reviewed_sha`. (priority: medium)

### Up Next

- [x] **Extract shared `runGh` helper** — The duplicated `runGh` closures in `deriveFilterRepo` and `deriveTrunkBranch` were replaced by shared `runGhWithFallback` helper to eliminate duplication while preserving behavior/logging. (priority: medium) [review Gate 4]

- [x] **Fix QA P1 bugs — steer textarea + GitHub aria-label** — (1) Steer textarea changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for mobile tap target compliance. (2) GitHub repo link gets `aria-label="Open repo on GitHub"`. (priority: high)

- [ ] **Fix focus management for mobile overlays** — Addresses QA bugs #3, #4, #5. Three fixes in AppView.tsx: (1) Mobile sidebar drawer (line 2337-2344): add `useEffect` with keydown listener for Escape → `setMobileMenuOpen(false)`, scoped to `mobileMenuOpen === true`. (2) Mobile sidebar focus: add `useEffect` that runs when `mobileMenuOpen` becomes true, focusing the first focusable element inside the sidebar `div.relative` container (use `ref` + `querySelectorAll`). On close, return focus to the hamburger button. (3) Command palette (line 2027-2028): `CommandInput` from cmdk should auto-focus but doesn't in this custom overlay wrapper — add `autoFocus` prop to `CommandInput`, or add a `useEffect` in `CommandPalette` that focuses the input when `open` becomes true. (priority: high)

- [ ] **Audit & fix hover-only interactions** — Confirmed gap: overflow tabs menu (AppView.tsx:1174-1186) uses `group-hover:block` with no click/tap equivalent. The `<div>` is purely hover-revealed with no `onClick` handler on the button (line 1175). Fix: add `useState` toggle + `onClick` on the overflow button, change dropdown visibility from `group-hover:block` to conditional rendering or state-based class. No other `onMouseEnter`/`onMouseOver` interactions reveal content — all other hover effects are purely cosmetic (Tailwind `hover:` for color/bg). (priority: medium)

- [ ] **Add ARIA labels to collapse/expand buttons** — Three buttons lack `aria-label`: (1) sidebar expand button (line 802) — add `aria-label="Expand sidebar"`, (2) sidebar collapse button (line 882) — add `aria-label="Collapse sidebar"`, (3) activity panel collapse button (line 2314) — add `aria-label="Collapse activity panel"`. These all have adjacent TooltipContent text that can be reused. Stop/force-stop dropdown: Radix already provides `aria-haspopup="menu"` on triggers — no fix needed. (priority: medium)

- [ ] **Implement long-press context menu on session cards** — Create a `useLongPress` hook with 500ms threshold using `onTouchStart`/`onTouchEnd`/`onTouchMove` (cancel on move). On trigger, show a context menu (reuse DropdownMenu component) with: Stop session, Force-stop session, Copy session ID. Add haptic feedback via `navigator.vibrate(50)` if available. Apply to session card elements in the sidebar (~line 835-838 of AppView.tsx). (priority: medium)

- [ ] **Runtime layout verification** — [review Gate 7] Run Playwright at 390x844 viewport and verify bounding boxes of key elements meet 44x44px minimum. (priority: medium)

- [ ] **Run Lighthouse mobile accessibility audit** — Run Lighthouse in mobile mode targeting accessibility category. Target score >= 90. (priority: low)

- [ ] **Capture proof artifacts** — [review Gate 6] Capture Playwright screenshots at mobile viewport. (priority: low)

### Completed (upstream — dashboard accessibility)

- [x] **Fix `deriveFilterRepo` env var fallback** — Removed `&& ghHost` guard so `GITHUB_REPOSITORY` is used unconditionally. Added test with only `GITHUB_REPOSITORY` set (no `GH_HOST`). (priority: high) [qa/P1 + review Gate 1 + review Gate 2]

- [x] **Implement startup health checks in `session-health.json`** — Added `runStartupHealthChecks` function that runs `gh auth status`, `gh repo view`, and `git status --porcelain` checks. All results (labels + startup checks) now written to `session-health.json`. (priority: high) [qa/P1 + review Gate 1]

- [x] **Implement `ALERT.md` on critical startup failures** — When `gh auth status` fails (critical check), writes `ALERT.md` with error details and throws with non-zero exit. `gh repo view` failure is non-critical since repo may not be configured yet. (priority: high) [qa/P1 + review Gate 1]

---

## Spec-Gap Analysis (2026-03-22)

### Findings

- [ ] **[spec-gap] SPEC.md missing orchestrator startup self-healing behaviors** — The code implements three self-healing features not documented in SPEC.md acceptance criteria: (1) `session-health.json` startup health checks (`gh auth status`, `gh repo view`, `git status --porcelain`) at `orchestrate.ts:1284-1347`, (2) `ALERT.md` creation on critical failures at `orchestrate.ts:1739-1757`, (3) `ensureLabels` label self-healing at `orchestrate.ts:1213-1260`. SPEC.md's orchestrator acceptance criteria (lines 2183-2229) don't mention startup validation or label bootstrapping. **Suggested fix:** Add acceptance criteria to SPEC.md under the orchestrator section covering startup health checks, ALERT.md on critical failure, and label self-healing. (priority: P2 — correctness drift, code ahead of spec)

### No Issues Found

- Config completeness: all 5 providers + round-robin consistent across `config.yml`, `start.ts`, loop scripts
- Model IDs current (last updated 2026-03-19), `start.ts` DEFAULT_MODELS match `config.yml`
- Template frontmatter: all loop templates use `provider: claude`; orchestrator templates correctly omit provider (runtime-provided)
- No orphan templates; all referenced templates exist
- Provider validation sets consistent across `start.ts` PROVIDER_SET and loop scripts
- TODO hygiene: all 4 items marked done, no stale or hallucinated items
- No previously filed `[spec-gap]` items to resolve
