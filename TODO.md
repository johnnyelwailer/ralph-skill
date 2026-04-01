# Issue #114: Responsive layout: touch targets, tap equivalents & accessibility audit

## Tasks

### Up Next

- [ ] [spec-gap] **P2** — `loop.sh` default Claude model is `sonnet` (line 33: `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-sonnet}"`), but `config.yml` (source of truth, line 21) declares `claude: opus`. `loop.ps1` line 34 correctly defaults to `opus`. Cross-platform parity broken; the two loop scripts diverge. Files: `aloop/bin/loop.sh:33`, `aloop/bin/loop.ps1:34`, `aloop/config.yml:21`. Suggested fix: update `loop.sh` line 33 to `CLAUDE_MODEL="${ALOOP_CLAUDE_MODEL:-opus}"` to match `config.yml` and `loop.ps1`.

- [ ] [spec-gap] **P2** — SPEC-ADDENDUM.md §Dashboard Responsiveness (line 214) defines tablet (640-1024px) as "Sidebar is collapsible (hidden by default, toggled via Ctrl+B / hamburger)". Code uses `md:hidden` on the hamburger button (`AppView.tsx:366`), which hides it at `min-width: 768px` (Tailwind `md:` breakpoint). Result: at 640-767px the hamburger shows (correctly), but at 768-1023px (also tablet per spec) it is hidden. Additionally, at 768px+ the sidebar renders as an icon-only collapsed rail (`hidden sm:flex` wrapper at `AppView.tsx:1329`) — not "hidden" as spec states. Proof test `e2e/proof.spec.ts:136-147` was written to match the implementation (sidebar visible, no hamburger at 768px), which diverges from SPEC-ADDENDUM. Files: `AppView.tsx:366,1329`, `SPEC-ADDENDUM.md:206-215`, `e2e/proof.spec.ts:136-147`. Suggested fix: either update spec to reflect implemented behavior (sidebar collapses to icon rail at tablet; hamburger threshold is 768px not 640px), or update code to use `sm:hidden` and truly hide the sidebar below a toggled state at all tablet widths.

### Completed
- [x] Run Lighthouse mobile accessibility audit and verify AC9 — score **94/100** (threshold: >= 90). Recorded in QA_LOG.md (2026-04-01 session). AC9 now explicitly verified. One P3 cosmetic finding (`button-name` in footer) does not affect pass/fail.
- [x] Implement responsive layout (SPEC-ADDENDUM.md §Dashboard Responsiveness) — 158 unit tests passing, review PASS. AC9 (Lighthouse score) explicitly verified: 94/100.
- [x] Playwright touch-event test for swipe-to-open sidebar — `e2e/proof.spec.ts:103-134` already implements the test: dispatches `touchstart`+`touchend` from left edge (clientX=5→80) and asserts `.fixed.inset-0.z-40` overlay becomes visible. QA_LOG false negative ("swipe NOT implemented") was a DOM attribute query limitation, not a missing implementation. `AppView.tsx:1014-1028` implements the handlers; `proof.spec.ts:103` verifies the behavior.
