# Issue #183: Configure Storybook 8 with react-vite and Tailwind decorators

## Current Phase: Implementation

### Context
The dashboard (`aloop/cli/dashboard/src/AppView.tsx`, ~2378 lines) has partial responsive support (mobile sidebar drawer, breakpoint-based hiding) but does not meet WCAG 2.5.8 tap target requirements, lacks long-press context menus, and has unverified tooltip/hover-card tap equivalents. Note: AppView.tsx is a monolith that SPEC-ADDENDUM says should be decomposed, but that's a separate issue — this issue focuses on accessibility within the existing structure.

### QA Bugs

- [x] [qa/P1] Steer textarea 32px height on mobile: Fixed — changed to `min-h-[44px] md:min-h-[32px] h-auto md:h-8` for WCAG 2.5.8 compliance. (priority: high)

- [x] [qa/P1] GitHub repo link missing aria-label: Fixed — added `aria-label="Open repo on GitHub"` to the link. (priority: high)

- [ ] [qa/P1] Escape key does not close mobile sidebar drawer: On mobile viewport (390x844), after opening the sidebar via hamburger button, pressing Escape does not close the sidebar. The sidebar overlay (`div.fixed.inset-0.z-40`) remains visible and the sidebar stays at width=256px. Clicking the overlay does close the sidebar correctly. Spec says "Escape key should close overlays and return focus." Fix: add keydown listener for Escape that closes the mobile sidebar drawer. Tested at iter 3. (priority: high)

- [ ] [qa/P1] Focus not moved into sidebar on mobile open: After tapping the hamburger button to open the mobile sidebar drawer, focus remains on the hamburger button instead of moving into the sidebar content. Spec says "When mobile sidebar drawer opens, focus should move to the drawer appropriately." Fix: after sidebar opens on mobile, programmatically focus the first focusable element inside the sidebar. Tested at iter 3. (priority: high)

- [ ] [qa/P1] Command palette focus not trapped on open: After pressing Ctrl+K to open command palette on mobile, `document.activeElement` is `BODY` instead of the search input inside the dialog. The palette renders correctly and Escape closes it, but keyboard focus is not in the input field. Fix: auto-focus the command input on open. Tested at iter 3. (priority: high)

### In Progress

### Up Next
- [ ] Create `.storybook/main.ts` in `aloop/cli/dashboard/` — configure `@storybook/react-vite` framework, set stories glob to `../src/**/*.stories.@(ts|tsx)`, add `@storybook/addon-essentials` and `@storybook/addon-themes` addons
- [ ] Create `.storybook/preview.ts` in `aloop/cli/dashboard/` — import `../src/index.css` for Tailwind styles, add dark mode decorator toggling `.dark` class on `document.documentElement` (using `@storybook/addon-themes` `withThemeByClassName`), wrap stories in Radix `TooltipProvider`
- [ ] Create `aloop/cli/dashboard/src/components/ui/button.stories.tsx` — verification story for the Button component. Include stories for each variant (default, ghost, outline, destructive) and both sizes (default, sm). Stories should render correctly in both light and dark mode via the global decorator.
- [ ] Verify `storybook build` produces static output without errors — confirms full pipeline works. Run `npx storybook build` from dashboard directory.

### Completed
- [x] Install Storybook 8 devDependencies and add `storybook`/`build-storybook` scripts to `aloop/cli/dashboard/package.json` — foundation for all other tasks. Required deps: `storybook`, `@storybook/react-vite`, `@storybook/react`, `@storybook/addon-essentials`, `@storybook/addon-themes`. Scripts: `"storybook": "storybook dev -p 6006"`, `"build-storybook": "storybook build"`. Run `npm install` to generate lock file changes.
