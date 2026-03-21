# Review Log

## Review — 2026-03-21 14:55 — commit 1fdc923..b0d98f4

**Verdict: FAIL** (3 findings → written to TODO.md as [review] tasks)
**Scope:** AppView.tsx, useLongPress.ts, useLongPress.test.tsx, context-menu.tsx, button.tsx, dropdown-menu.tsx, tabs.tsx, App.coverage.test.ts

### Gate 1: Spec Compliance — PASS
- 44x44px tap targets: applied via `min-h-11 min-w-11` with `md:min-h-0 md:min-w-0` responsive reset across buttons, tabs, dropdowns, context menu items, collapsible triggers. Covers all interactive elements.
- Swipe gesture: implemented on app shell with `touch-pan-y`, 30px edge threshold, 60px distance, 40px vertical drift limit. Correct.
- Long-press context menus: `useLongPress` hook (500ms, 10px move threshold) wired to `SessionContextMenu` and `LogEntryContextMenu`. Menus provide copy actions (session ID, path, raw log, JSON payload). Matches spec.
- HoverCard tap, tooltip tap-to-toggle, Lighthouse audit: correctly marked as not-yet-done in TODO.md.

### Gate 2: Test Depth — FAIL
- `useLongPress.test.tsx:19-31` — first test correctly asserts exact `{clientX: 15, clientY: 25}` and DOM node identity. Good.
- `useLongPress.test.tsx:33-43` — second test correctly verifies move cancellation with `not.toHaveBeenCalled()`. Good.
- Missing: no test for early touchEnd (before timer fires), no test for multi-touch rejection, no test for touchCancel, no test for click suppression after long-press.
- `App.coverage.test.ts:578-599` — swipe test asserts the mobile overlay appears (`.fixed.inset-0.z-40`). Adequate for integration.

### Gate 3: Coverage — FAIL
- `useLongPress.ts` is a **new module** — requires >=90% branch coverage per review policy.
- Current test covers ~2 of 8 branches: happy-path long-press and move-cancel. Untested: multi-touch early return (L45), touchMove with no startRef (L58), touchCancel (L71), onClickCapture suppression (L76-79), clearPress with null timeout (L37).
- Estimated branch coverage: ~25%. Far below 90% threshold.

### Gate 4: Code Quality — FAIL (minor)
- `openLongPressContextMenu` in AppView.tsx dispatches a synthetic PointerEvent to trick Radix ContextMenu into opening. This is a fragile internal coupling with no documentation. Needs a comment explaining the workaround and Radix version dependency.
- No dead code, no unused imports, no copy-paste duplication detected. `copyToClipboard` utility is correctly shared.

### Gate 5: Integration Sanity — PASS
- `npm run type-check` passes (tsc --noEmit).
- `npm run build` passes.
- Dashboard vitest: 90/90 pass (when run from dashboard dir); useLongPress tests pass in correct environment.
- CLI node tests: 13 pre-existing failures unrelated to this branch's changes.

### Gate 6: Proof Verification — PASS (N/A)
- No proof-manifest.json found. This is UI work that would benefit from screenshots, but QA_LOG.md documents manual Playwright QA with screenshot evidence (swipe, long-press, tap targets). Acceptable as proof lives outside the artifacts pipeline.

### Gate 7: Runtime Layout Verification — SKIP
- Changes are touch interaction logic and min-height sizing, not CSS Grid/Flexbox layout restructuring. The `min-h-11` additions don't change layout flow. QA_LOG.md confirms mobile/desktop layout screenshots were verified.

### Gate 8: Version Compliance — PASS
- `@radix-ui/react-context-menu@2.2.16` installed, VERSIONS.md declares `2.x`. Match.
- No other dependency changes.

### Gate 9: Documentation Freshness — PASS
- No user-facing docs changes needed — these are internal UI improvements. No README claims affected.

---
