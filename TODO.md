# TODO — Issue #81: Skill file parity

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### QA Bugs

- [x] [qa/P1] Steer textarea 32px height on mobile: Fixed — changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for WCAG 2.5.8 compliance. (priority: high)

- [x] [qa/P1] GitHub repo link missing aria-label: Fixed — added `aria-label="Open repo on GitHub"` to the link. (priority: high)

- [x] [qa/P1] Escape key does not close mobile sidebar drawer: Fixed — added Escape keydown listener scoped to `mobileMenuOpen === true`. (priority: high)

- [x] [qa/P1] Focus not moved into sidebar on mobile open: Fixed — added useEffect that focuses first focusable element in sidebar on open, returns focus to hamburger button on close. (priority: high)

- [x] [qa/P1] Command palette focus not trapped on open: Fixed — added ref + useEffect to auto-focus CommandInput when palette opens. (priority: high)

### In Progress

### Up Next

- [ ] **Audit & fix hover-only interactions** — Confirmed gap: overflow tabs menu (AppView.tsx:1174-1186) uses `group-hover:block` with no click/tap equivalent. The `<div>` is purely hover-revealed with no `onClick` handler on the button (line 1175). Fix: add `useState` toggle + `onClick` on the overflow button, change dropdown visibility from `group-hover:block` to conditional rendering or state-based class. No other `onMouseEnter`/`onMouseOver` interactions reveal content — all other hover effects are purely cosmetic (Tailwind `hover:` for color/bg). (priority: medium)

- [ ] **Add ARIA labels to collapse/expand buttons** — Three buttons lack `aria-label`: (1) sidebar expand button (line 802) — add `aria-label="Expand sidebar"`, (2) sidebar collapse button (line 882) — add `aria-label="Collapse sidebar"`, (3) activity panel collapse button (line 2314) — add `aria-label="Collapse activity panel"`. These all have adjacent TooltipContent text that can be reused. Stop/force-stop dropdown: Radix already provides `aria-haspopup="menu"` on triggers — no fix needed. (priority: medium)

- [ ] **Implement long-press context menu on session cards** — Create a `useLongPress` hook with 500ms threshold using `onTouchStart`/`onTouchEnd`/`onTouchMove` (cancel on move). On trigger, show a context menu (reuse DropdownMenu component) with: Stop session, Force-stop session, Copy session ID. Add haptic feedback via `navigator.vibrate(50)` if available. Apply to session card elements in the sidebar (~line 835-838 of AppView.tsx). (priority: medium)

- [x] **Runtime layout verification** — [review Gate 7] Added Playwright coverage in `e2e/smoke.spec.ts` that runs at 390x844 and asserts 44x44px minimum bounding boxes for hamburger button, session cards, tab triggers, dropdown items, and steer textarea. (priority: medium)

- [ ] **Run Lighthouse mobile accessibility audit & fix flagged issues** — Run Lighthouse in mobile mode targeting accessibility category. Fix any issues flagged: color contrast ratios, missing alt text, focus indicators, ARIA violations. Target score >= 90. Document final score. (priority: low)

- [ ] **Capture proof artifacts** — [review Gate 6] Capture Playwright screenshots or recordings at mobile viewport showing (a) tap targets at 44px minimum, (b) tooltip opening on tap, (c) hover-card opening on tap. If proof agent cannot produce these, skip with empty artifacts array. (priority: low)

### Completed

- [x] **Fix focus management for mobile overlays** — Addresses QA bugs #3, #4, #5. Three fixes in AppView.tsx: (1) Escape key closes mobile sidebar drawer. (2) Focus moves into sidebar on open, returns to hamburger on close. (3) Command palette auto-focuses input on open. (priority: high)

- [x] **Fix QA P1 bugs — steer textarea + GitHub aria-label** — (1) Steer textarea changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for mobile tap target compliance. (2) GitHub repo link gets `aria-label="Open repo on GitHub"`. (priority: high)

- [x] [review] Gate 6: Create `proof-manifest.json`. QA session 2 provides equivalent Playwright evidence, so skip with `{"artifacts": []}`. Process gap, not a confidence gap. [reviewed: gates 1-9 pass]

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
