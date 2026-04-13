# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

### Completed
- [x] Install Storybook 8 devDependencies (`storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`) in `aloop/cli/dashboard/package.json`
- [x] Add `storybook` and `build-storybook` scripts to `aloop/cli/dashboard/package.json`
- [x] Create `aloop/cli/dashboard/.storybook/main.ts` with `@storybook/react-vite` framework, stories glob, addons, and `@/` path alias via `viteFinal`
- [x] Create `aloop/cli/dashboard/.storybook/preview.tsx` with Tailwind CSS import, `TooltipProvider` decorator, and dark mode toggle via `withThemeByClassName`
- [x] Create `aloop/cli/dashboard/src/components/ui/button.stories.tsx` verification story with light and dark mode variants
