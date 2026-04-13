# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

### Completed
- [x] Install Storybook 8 devDependencies in `package.json` (`storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`)
- [x] Add `storybook` and `build-storybook` scripts to `package.json`
- [x] Create `.storybook/main.ts` with `@storybook/react-vite` framework, stories glob, addons, and `viteFinal` hook for `@/` path alias
- [x] Create `.storybook/preview.tsx` with Tailwind CSS import, dark-mode decorator (`withThemeByClassName`), and `TooltipProvider` wrapper
- [x] Create `src/components/ui/button.stories.tsx` with Default, Destructive, Outline, Ghost, Small, and DarkMode story variants
