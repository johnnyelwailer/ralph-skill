# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Tasks

- [x] Implement as described in the issue

## Verification

All acceptance criteria verified:
- Storybook 10.x installed (matches VERSIONS.md)
- `@storybook/react-vite` framework configured
- Global decorators: `withThemeByClassName` (dark mode), `TooltipProvider`, Tailwind CSS
- `npm run storybook` works
- `npm run build-storybook` produces static build
- Button stories exist and render in both light/dark modes
- No changes to existing source code or tests
