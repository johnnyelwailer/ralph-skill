## Summary

- Set up Storybook 8 infrastructure in `aloop/cli/dashboard/` with `@storybook/react-vite`, Tailwind CSS decorator, dark-mode toggle, and `TooltipProvider` wrapper
- Extracted `ElapsedTimer`, `PhaseBadge`, `StatusDot`, and `ConnectionIndicator` from `AppView.tsx` as shared components with tests and Storybook stories
- Fixed child loops running without an iteration cap in orchestrate mode (SPEC-ADDENDUM: "Orchestrate Mode: No Iteration Cap")

## Files Changed

- `aloop/cli/dashboard/package.json` — added `storybook`/`build-storybook` scripts and Storybook 8 devDependencies
- `aloop/cli/dashboard/.storybook/main.ts` — `@storybook/react-vite` framework, stories glob
- `aloop/cli/dashboard/.storybook/preview.ts` — three global decorators (Tailwind CSS, dark-mode, TooltipProvider)
- `aloop/cli/dashboard/src/components/ui/button.stories.tsx` — verification story for all button variants (light + dark)
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.tsx` — extracted from AppView.tsx
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.tsx` — extracted from AppView.tsx
- `aloop/cli/dashboard/src/components/shared/StatusDot.tsx` — extracted from AppView.tsx, added `sr-only` label span
- `aloop/cli/dashboard/src/components/shared/ConnectionIndicator.tsx` — extracted from AppView.tsx
- `aloop/cli/dashboard/src/components/shared/StatusDot.test.tsx` — text-based assertions via sr-only label
- `aloop/bin/loop.sh` — support `MAX_ITERATIONS=0` as "run indefinitely"
- `aloop/bin/loop.ps1` — support `$MaxIterations -eq 0` as "run indefinitely"
- `aloop/cli/src/commands/orchestrate.ts` — pass `max_iterations` from `OrchestratorState` to child loops (default 0 = unlimited)
- `aloop/cli/src/commands/orchestrate.test.ts` — 3 tests covering undefined→0, explicit Linux, explicit win32
- `proof-artifacts/` — Playwright screenshots for all 7 StatusDot variants

## Verification

- [x] `npm run storybook` launches Storybook on port 6006 — verified by QA (iter-11)
- [x] `npm run build-storybook` produces static build without errors — verified by QA (iter-11)
- [x] Button story renders correctly in both light and dark mode — verified via `button.stories.tsx`
- [x] Global decorator applies Tailwind styles matching dashboard appearance — verified by QA
- [x] Storybook uses same `tailwind.config.ts` as dashboard — confirmed in `.storybook/preview.ts`
- [ ] No changes to existing source code or tests — NOT met: component extractions added new source files and tests (required for subsequent dashboard decomposition work)

**Open QA P1 bug:** `[qa/P1]` Missing Storybook stories for `SessionCard`, `SteerInput`, `ActivityLog`, `ProgressBar` — these components do not yet exist (they remain inside monolithic `AppView.tsx`). Stories can only be written once components are extracted in follow-up issues.

## Proof Artifacts

- Screenshot: `proof-artifacts/statusdot-running.png`
- Screenshot: `proof-artifacts/statusdot-stopped.png`
- Screenshot: `proof-artifacts/statusdot-error.png`
- Screenshot: `proof-artifacts/statusdot-exited.png`
- Screenshot: `proof-artifacts/statusdot-stuck.png`
- Screenshot: `proof-artifacts/statusdot-unhealthy.png`
- Screenshot: `proof-artifacts/statusdot-unknown.png`
- Screenshot: `proof-artifacts/elapsedtimer-juststarted.png`
- Screenshot: `proof-artifacts/elapsedtimer-ninetyseconds.png`
- Screenshot: `proof-artifacts/elapsedtimer-twominutes.png`
- Screenshot: `proof-artifacts/phasebadge-{build,plan,proof,review,small,unknown}.png`
- Screenshot: `proof-artifacts/connectionindicator-{connected,connecting,disconnected}.png`
