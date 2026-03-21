# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Current Phase: Implementation

### In Progress

### Up Next
- [ ] Create `.storybook/main.ts` in `aloop/cli/dashboard/` — configure `@storybook/react-vite` framework, set stories glob to `../src/**/*.stories.@(ts|tsx)`, add `@storybook/addon-essentials` and `@storybook/addon-themes` addons
- [ ] Create `.storybook/preview.ts` in `aloop/cli/dashboard/` — import `../src/index.css` for Tailwind styles, add dark mode decorator toggling `.dark` class on `document.documentElement` (using `@storybook/addon-themes` `withThemeByClassName`), wrap stories in Radix `TooltipProvider`
- [ ] Create `aloop/cli/dashboard/src/components/ui/button.stories.tsx` — verification story for the Button component. Include stories for each variant (default, ghost, outline, destructive) and both sizes (default, sm). Stories should render correctly in both light and dark mode via the global decorator.
- [ ] Verify `storybook build` produces static output without errors — confirms full pipeline works. Run `npx storybook build` from dashboard directory.

### Completed
- [x] Install Storybook 8 devDependencies and add `storybook`/`build-storybook` scripts to `aloop/cli/dashboard/package.json` — foundation for all other tasks. Required deps: `storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`. Scripts: `"storybook": "storybook dev -p 6006"`, `"build-storybook": "storybook build"`. Run `npm install` to generate lock file changes.
