# Frontend Conventions — Aloop Dashboard

> Agents read this file to enforce consistent frontend patterns in the dashboard SPA.

## Stack

| Concern | Tool | Version |
|---------|------|---------|
| Framework | React | 18.x (functional components only) |
| Build | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| Component primitives | Radix UI | Latest |
| Component patterns | shadcn/ui | Copy-paste into `components/ui/` |
| Icons | lucide-react | Latest |
| Class merging | `clsx` + `tailwind-merge` via `cn()` | — |
| State | React hooks (useState, useEffect, useReducer) | — |
| Testing | Vitest + Testing Library | — |
| E2E | Playwright | 1.x |
| Component dev | Storybook | — |

## Component Architecture

- **Functional components only.** No class components, ever.
- **No default exports.** Use named exports for all components.
- **Props via TypeScript interfaces.** Define inline for small components, extract for reuse.

```tsx
interface SessionCardProps {
  sessionId: string;
  status: SessionStatus;
  onSelect: (id: string) => void;
}

export function SessionCard({ sessionId, status, onSelect }: SessionCardProps) {
  return (
    <div className={cn("rounded-lg border p-4", status === "active" && "border-green-500")}>
      <h3 className="text-sm font-medium">{sessionId}</h3>
      <button onClick={() => onSelect(sessionId)}>View</button>
    </div>
  );
}
```

## Styling with Tailwind + cn()

- **Use Tailwind utility classes directly.** No CSS modules, no styled-components.
- **Use `cn()` for conditional classes.** Combines `clsx` + `tailwind-merge`.
- **Component variants via `class-variance-authority` (cva)** for complex variant logic.

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- Keep Tailwind classes in render, not in separate constants (unless reused 3+ times).
- Responsive: mobile-first (`sm:`, `md:`, `lg:` breakpoints).

## Radix UI + shadcn Patterns

- **Radix for behavior, Tailwind for styling.** Radix provides accessible primitives; style them with Tailwind.
- **shadcn components live in `components/ui/`.** These are project-owned copies, not node_modules.
- **Don't modify Radix internals.** Compose around them.

Current Radix primitives in use:
- `@radix-ui/react-collapsible` — collapsible sections
- `@radix-ui/react-dropdown-menu` — menus
- `@radix-ui/react-hover-card` — hover previews
- `@radix-ui/react-progress` — progress bars
- `@radix-ui/react-scroll-area` — scrollable regions
- `@radix-ui/react-tabs` — tab navigation
- `@radix-ui/react-tooltip` — tooltips

## Icons

- **Use `lucide-react` exclusively.** No mixing icon libraries.
- Import individual icons: `import { Play, Pause, AlertCircle } from 'lucide-react'`
- Standard size: `size={16}` for inline, `size={20}` for standalone.

## Vite Dev Server

- **Dev:** `npm --prefix aloop/cli/dashboard run dev` — Vite dev server with HMR.
- **API proxy:** Vite proxies `/api/*` and `/events` to the aloop CLI server during development.
- **Build:** `vite build` outputs to `dist/dashboard/` inside the CLI package.
- The built dashboard is served statically by the CLI's Express server in production.

## State Management

- **React hooks for local state.** `useState`, `useReducer`, `useContext`.
- **No Redux, no Zustand, no external state library.** The dashboard is simple enough for hooks.
- **SSE (Server-Sent Events) for real-time updates.** The dashboard uses `EventSource` to connect to `/events` — server pushes session state changes; dashboard renders them. Auto-reconnects with exponential backoff on disconnect.
- **Fetch for API calls.** Use native `fetch` — no axios.

## Component Development with Storybook

- Develop components in isolation before integrating.
- Each UI component in `components/ui/` should have a story.
- Stories demonstrate all variants and edge cases.
- Use Storybook for visual regression catching.

## File Organization

```
dashboard/src/
  App.tsx              # Root component
  AppView.tsx          # Main layout and orchestration
  main.tsx             # Entry point
  index.css            # Tailwind imports
  components/
    LogEntryRow.tsx    # Activity log entry (expandable)
    artifacts/
      ArtifactViewer.tsx           # Image/file preview
      ArtifactComparisonDialog.tsx # Before/after (side-by-side, slider, overlay)
    layout/
      ResponsiveLayout.tsx         # Breakpoint logic, mobile hamburger
    progress/
      CostDisplay.tsx              # Token/cost display per iteration
    session/
      SessionCard.tsx              # Single session entry in sidebar
      SessionContextMenu.tsx       # Long-press context menu for sessions
    shared/
      ElapsedTimer.tsx             # Live-counting timer
      PhaseBadge.tsx               # Phase label badge
      StatusDot.tsx                # Status indicator dot
    ui/                # shadcn/Radix primitives (project-owned copies)
  hooks/
    useLongPress.ts    # Long-press detection (pointer events)
    useIsTouchDevice.ts # Detect touch vs pointer device
    useBreakpoint.ts   # Responsive breakpoint detection
    useCost.ts         # Session cost aggregation
  lib/
    ansi.ts            # ANSI → HTML parsing
    format.ts          # Formatting helpers (duration, tokens, etc.)
    log.ts             # Log parsing and event utilities
    providerHealth.ts  # Provider health state helpers
    types.ts           # Shared TypeScript interfaces
    utils.ts           # cn() and shared utilities
  test-setup.ts        # Vitest + Testing Library setup
```

- **Colocate tests:** `App.test.tsx` next to `App.tsx`.
- **Coverage tests:** `App.coverage.test.ts` for coverage-specific scenarios.
- Feature components go in `components/` (not in `ui/`).
- **Target: ~150 LOC per file.** Files above 200 LOC should be split. See SPEC-ADDENDUM.md for the full decomposition plan.

## Accessibility

- **Radix provides accessibility by default.** Don't override ARIA attributes unless you know what you're doing.
- **All interactive elements must be keyboard accessible.**
- **Color is not the only indicator.** Use icons or text alongside color signals.
- **Test with keyboard navigation** — Tab, Enter, Escape, Arrow keys.
- **Tap target sizing on mobile (WCAG 2.5.5):** Every interactive element that is primary on mobile must have `min-h-[44px] md:min-h-0` (and `min-w-[44px] md:min-w-0` for icon-only elements). The `md:min-h-0` removes the constraint at ≥768px where pointer precision is assumed. Do not use inline styles or arbitrary pixel values — use the Tailwind class.
- **Use semantic elements for interactivity.** Clickable rows and custom controls must be `<button type="button">` (not `<div onClick>`). If a non-button element must be interactive, add `role="button" tabIndex={0}` and an `onKeyDown` handler for `Enter`/`Space`.
- **No hover-only interactions.** Every hover affordance (tooltip, hover card) must also activate on tap/click. Use `useIsTouchDevice` to detect touch and switch to tap-toggle behavior.

## Performance

- **Lazy load heavy components** with `React.lazy()` + `Suspense`.
- **Memoize expensive renders** with `React.memo()` — but only when profiling shows a problem.
- **No premature optimization.** Profile first, optimize second.

## Additional Libraries in Use

- `cmdk` — command palette (Cmd+K) — implemented in `AppView.tsx`
- `react-resizable-panels` — resizable pane layout — wrapper available in `components/ui/resizable.tsx` but not currently wired into the layout (layout uses CSS flex instead)
- `sonner` — toast notifications
- `marked` — markdown rendering (sanitize output!)

References:
- [React Docs](https://react.dev/)
- [Radix UI](https://www.radix-ui.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Vite](https://vitejs.dev/)
