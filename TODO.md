# Project TODO

## Current Phase: Issue #183 — Storybook 8 setup with react-vite and Tailwind decorators

### In Progress

### Up Next
- [x] Run `npm install` in `aloop/cli/dashboard/` and fix any dependency resolution errors (critical: node_modules absent, nothing can run)
- [x] Run `npm run build-storybook` and fix any build errors (verifies static build acceptance criterion)
- [x] Verify `npm run storybook` launches on port 6006 (smoke test; CI/build-check is sufficient)

### QA Bugs
- [ ] [qa/P1] Missing stories for 4/5 core dashboard components: spec acceptance criterion requires stories for SessionCard, SteerInput, ActivityLog, and ProgressBar, but these components do not exist yet (dashboard is still a monolithic AppView.tsx). Only ProviderHealth.stories.tsx exists. Tested at QA session 2026-03-27. (priority: high)

### Completed
- [x] Add `storybook` and `build-storybook` scripts to `aloop/cli/dashboard/package.json`
- [x] Add all required Storybook devDependencies to `package.json` (`storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-docs`, `@storybook/addon-themes`)
- [x] Create `aloop/cli/dashboard/.storybook/main.ts` with `@storybook/react-vite` framework and `../src/**/*.stories.@(ts|tsx)` glob
- [x] Create `aloop/cli/dashboard/.storybook/preview.ts` with three global decorators: Tailwind CSS (`index.css` import), dark-mode toggle (`withThemeByClassName` targeting `.dark` on `html`), and `TooltipProvider` wrapper
- [x] Create `aloop/cli/dashboard/src/components/ui/button.stories.tsx` with light/dark-compatible stories for all button variants and sizes [reviewed: gates 1-9 pass]
