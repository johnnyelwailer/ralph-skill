# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

### Completed
- [x] Create `.storybook/main.ts` with `@storybook/react-vite` framework, story glob `../src/**/*.stories.@(ts|tsx)`, addons, and `viteFinal` hook for `@/` path alias
- [x] Create `.storybook/preview.tsx` with Tailwind CSS decorator (imports `../src/index.css`), dark mode decorator via `withThemeByClassName`, and `TooltipProvider` wrapper
- [x] Create `src/components/ui/button.stories.tsx` with light and dark mode stories
- [x] Add `storybook` and `build-storybook` scripts to `package.json`
- [x] Add all required devDependencies to `package.json`: `storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`
- [x] Run `npm install` in `aloop/cli/dashboard/` to install Storybook packages, then verify `npm run storybook` launches on port 6006 and `npx storybook build` succeeds without errors
