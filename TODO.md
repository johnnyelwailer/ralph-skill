# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

### Completed
- [x] Install Storybook 8 devDependencies in package.json (`storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`)
- [x] Add `storybook` and `build-storybook` scripts to package.json
- [x] Create `.storybook/main.ts` with `@storybook/react-vite` framework, story glob, addons, and `viteFinal` hook for `@/` path alias
- [x] Create `.storybook/preview.tsx` with Tailwind CSS import, `withThemeByClassName` dark mode decorator, and `TooltipProvider` wrapper
- [x] Create `src/components/ui/button.stories.tsx` verification story with multiple variants including dark mode
- [x] Storybook build confirmed working via git history (build-storybook success)
