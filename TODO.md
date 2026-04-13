# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

### Up Next
- [x] Add `viteFinal` hook to `.storybook/main.ts` to propagate the `@/` path alias
  (Storybook's own Vite instance doesn't inherit `vite.config.ts`; `preview.tsx` imports
  `@/components/ui/tooltip` which will fail to resolve without explicit alias config in `viteFinal`)

### Completed
- [x] Install Storybook 8 devDependencies (`storybook`, `@storybook/react-vite`, `@storybook/react`,
  `@storybook/addon-essentials`, `@storybook/addon-themes`) in `package.json`
- [x] Add `storybook` and `build-storybook` scripts to `package.json`
- [x] Create `.storybook/main.ts` with `@storybook/react-vite` framework, story glob, and addons
- [x] Create `.storybook/preview.tsx` with Tailwind CSS import, `withThemeByClassName` dark mode
  decorator, and `TooltipProvider` wrapper
- [x] Create `src/components/ui/button.stories.tsx` with multiple variant stories
