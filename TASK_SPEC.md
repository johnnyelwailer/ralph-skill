# Sub-Spec: Issue #183 — Configure Storybook 8 with react-vite and Tailwind decorators

Part of #29: Epic: Dashboard Core — Component Refactor & Real-Time UI

## Objective

Set up Storybook 8 infrastructure in the dashboard project so that subsequent component extraction sub-issues can add stories alongside components.

## Scope

### Storybook Configuration
- Install Storybook 8 with `@storybook/react-vite` framework adapter
- Create `.storybook/` directory in `aloop/cli/dashboard/`
- Configure `main.ts` to find `*.stories.tsx` files colocated with components
- Configure `preview.ts` with global decorators

### Global Decorators
- Tailwind CSS context decorator (imports `index.css`)
- Dark mode toggle decorator using `@storybook/addon-themes` or custom decorator that toggles `.dark` class on root
- Tooltip provider wrapper (Radix UI `TooltipProvider`)

### Package.json Scripts
- Add `storybook` script: `storybook dev -p 6006`
- Add `build-storybook` script: `storybook build`
- Install required devDependencies: `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`, `storybook`

### Verification Story
- Create a simple `Button.stories.tsx` for the existing `ui/button.tsx` component to verify the setup works
- Story should render in both light and dark mode

## Inputs
- `aloop/cli/dashboard/package.json` (existing deps)
- `aloop/cli/dashboard/tailwind.config.ts` (theme config)
- `aloop/cli/dashboard/src/index.css` (CSS custom properties)

## Outputs
- `aloop/cli/dashboard/.storybook/main.ts`
- `aloop/cli/dashboard/.storybook/preview.ts`
- `aloop/cli/dashboard/src/components/ui/button.stories.tsx`
- Updated `aloop/cli/dashboard/package.json` with Storybook deps and scripts

## Acceptance Criteria
- [ ] `npm run storybook` launches Storybook on port 6006
- [ ] `npx storybook build` produces static build without errors
- [ ] Button story renders correctly in both light and dark mode
- [ ] Global decorator applies Tailwind styles matching dashboard appearance
- [ ] Storybook uses same `tailwind.config.ts` as dashboard
- [ ] No changes to existing source code or tests

## Labels
`aloop/sub-issue`, `aloop/needs-refine`
