# Sub-Spec: Issue #158 — Set up Storybook 8 with global decorators and initial stories

## Objective

Configure Storybook 8 for the dashboard package, add global decorators for Tailwind CSS and dark-mode toggle, and create initial stories for five new shared components extracted from existing utility patterns.

## Architectural Context

The dashboard lives at `aloop/cli/dashboard/` and is a standalone Vite + React 18 + Tailwind 3 + TypeScript project.

- **Build tool**: Vite 5 — Storybook must use `@storybook/react-vite` to stay on the same bundler
- **Dark mode**: `tailwind.config.ts` uses `darkMode: ['class']` — toggling dark mode requires adding/removing the `dark` class on `<html>`, not a media query
- **Path alias**: `vite.config.ts` maps `@` → `./src`; `main.ts` must replicate this in `viteFinal` so story imports resolve
- **CSS**: Tailwind is imported via `src/index.css`; that file must be imported in `preview.ts` so stories get styles
- **Existing Storybook deps**: Most dependencies are already installed (storybook 8.6.x, `@storybook/react`, `@storybook/react-vite`, `@storybook/addon-essentials`, `@storybook/addon-themes`, `storybook`). Only `@storybook/addon-interactions` is missing.
- **Existing npm scripts**: `"storybook": "storybook dev -p 6006"` and `"build-storybook": "storybook build"` are already in `package.json`. Do NOT rename them — the issue's spec of `"storybook:build"` is incorrect; the existing `"build-storybook"` key is correct.
- **Shared components**: `src/components/shared/` does not exist. The five components referenced in stories must be created in this issue alongside their stories.
- **AppView.tsx exports**: ANSI parsing utilities (`parseAnsiSegments`, `renderAnsiToHtml`, `stripAnsi`) and status/phase patterns live in `AppView.tsx`. The `AnsiRenderer` story can import these functions directly — do not copy the logic.
- **tsconfig.json**: Currently includes `["src", "vite.config.ts", "tailwind.config.ts"]`. `.storybook/` files are not included; add a `.storybook/tsconfig.json` extending the root config with `"include": [".."]` so `.storybook/*.ts` type-checks correctly.

## Scope

Files in-scope for creation or modification:

### New files — Storybook config
- `aloop/cli/dashboard/.storybook/main.ts` — framework: `@storybook/react-vite`, stories glob: `../src/**/*.stories.tsx`, addons, `viteFinal` with `@` alias
- `aloop/cli/dashboard/.storybook/preview.ts` — import `src/index.css`, `withThemeByClassName` decorator for dark mode, viewport presets
- `aloop/cli/dashboard/.storybook/tsconfig.json` — extends `../tsconfig.json`, includes `..`

### Modified — package.json
- Add `@storybook/addon-interactions` to devDependencies (only missing dep)
- Do NOT rename existing `"storybook"` or `"build-storybook"` scripts

### New files — shared components
Each component must be < 150 LOC (Constitution rule 7). If extracted logic would exceed that, split into a helper module.

- `aloop/cli/dashboard/src/components/shared/StatusDot.tsx` — small colored dot indicating session/loop status (idle, running, error, done, etc.)
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.tsx` — pill badge for the current loop phase (plan, build, review, etc.)
- `aloop/cli/dashboard/src/components/shared/ConnectionIndicator.tsx` — SSE connection state badge (connected / connecting / disconnected)
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.tsx` — displays elapsed time from a start timestamp; auto-ticks when running
- `aloop/cli/dashboard/src/components/shared/AnsiRenderer.tsx` — renders ANSI-colored text by calling `parseAnsiSegments` from `AppView.tsx`

### New files — stories
- `aloop/cli/dashboard/src/components/shared/StatusDot.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/ConnectionIndicator.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/AnsiRenderer.stories.tsx`

## Out of Scope

- **`AppView.tsx`** — must NOT be modified (Constitution rule 18: file ownership; the refactor of AppView is a separate concern). Stories must import utilities from AppView without modifying it.
- **`loop.sh` / `loop.ps1`** — unrelated (Constitution rules 1–2)
- **`vite.config.ts`** — must not be changed; replicate the alias in `main.ts`'s `viteFinal` instead
- **`tailwind.config.ts`** — must not be changed; dark mode class strategy is already correct
- **`tsconfig.json`** (root) — do not modify the root tsconfig; add a `.storybook/tsconfig.json` instead
- **Existing `src/components/ui/`** — shadcn/ui components; do not add stories for them in this issue
- **Test files** — no new Vitest/Playwright tests required for Storybook config itself; component unit tests are out of scope for this issue

## Constraints

- **Constitution rule 7** — each new `.tsx` file must stay under 150 LOC. Split if needed.
- **Constitution rule 8** — shared components must do one thing; don't mix rendering with data fetching
- **Constitution rule 11** — no stories without their component rendering correctly; at minimum render-smoke-test each story
- **Constitution rule 12** — this issue covers only Storybook setup and the five initial stories; don't bundle unrelated refactors
- **Constitution rule 15** — no hardcoded port in `main.ts`; port 6006 belongs only in the `storybook` npm script
- **Constitution rule 19** — implement only what's listed; don't add extra addons, MDX docs, or story variants beyond what's specified
- **Dark mode decorator**: use `@storybook/addon-themes`'s `withThemeByClassName` targeting the `<html>` element with class `dark` — matching the Tailwind `darkMode: ['class']` config
- **`@` alias in Storybook**: `main.ts` must configure `viteFinal` to add the same `resolve.alias` as `vite.config.ts` (`@` → `path.resolve(__dirname, '../src')`)
- **`@storybook/addon-interactions`**: add to `devDependencies` and include in addons array in `main.ts`

## Acceptance Criteria

- [ ] `.storybook/main.ts` exists and declares `framework: '@storybook/react-vite'`, the `../src/**/*.stories.tsx` glob, all four addons, and a `viteFinal` that adds the `@` → `src` alias
- [ ] `.storybook/preview.ts` imports `src/index.css` and applies the `withThemeByClassName` dark-mode decorator targeting `html.dark`
- [ ] `.storybook/tsconfig.json` exists and extends root tsconfig
- [ ] `package.json` devDependencies contains `@storybook/addon-interactions`; existing scripts `"storybook"` and `"build-storybook"` are unchanged
- [ ] All five shared components exist under `src/components/shared/` and are each < 150 LOC
- [ ] All five `.stories.tsx` files exist and each exports at least one named story
- [ ] `npm run storybook` (port 6006) starts without errors and all five stories render
- [ ] `npm run build-storybook` produces static output in `storybook-static/` without errors
- [ ] Dark/light mode toggle appears in Storybook toolbar and switching it toggles the `dark` class on `<html>`
- [ ] No modifications to `AppView.tsx`, `vite.config.ts`, `tailwind.config.ts`, or the root `tsconfig.json`

## Files

### Create
- `aloop/cli/dashboard/.storybook/main.ts`
- `aloop/cli/dashboard/.storybook/preview.ts`
- `aloop/cli/dashboard/.storybook/tsconfig.json`
- `aloop/cli/dashboard/src/components/shared/StatusDot.tsx`
- `aloop/cli/dashboard/src/components/shared/StatusDot.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.tsx`
- `aloop/cli/dashboard/src/components/shared/PhaseBadge.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/ConnectionIndicator.tsx`
- `aloop/cli/dashboard/src/components/shared/ConnectionIndicator.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.tsx`
- `aloop/cli/dashboard/src/components/shared/ElapsedTimer.stories.tsx`
- `aloop/cli/dashboard/src/components/shared/AnsiRenderer.tsx`
- `aloop/cli/dashboard/src/components/shared/AnsiRenderer.stories.tsx`

### Modify
- `aloop/cli/dashboard/package.json` — add `@storybook/addon-interactions` to devDependencies only

## Aloop Metadata
- Parent Epic: #29
- Labels: `aloop/sub-issue`, `aloop/needs-refine`

**Wave:** 1
**Dependencies:** none
