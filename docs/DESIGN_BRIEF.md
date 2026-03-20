# Aloop Dashboard — Design Brief

## Visual Identity

**Vibe: Developer ops console** — Vercel, Linear, Grafana. Dense, functional, confident. Not flashy, not playful.

**Reference products** (study these for spacing, density, type hierarchy):
- Vercel dashboard (deployment list, logs view)
- Linear (issue list, sidebar navigation)
- GitHub Actions (run detail, log streaming)
- Grafana (panel layout, dark/light switching)

## Color System

**Dark AND light mode — both must be first-class.** Use shadcn/Tailwind CSS variables exclusively. Never hardcode colors.

```
/* Use these, not Tailwind color literals */
--background, --foreground
--card, --card-foreground
--muted, --muted-foreground
--border
--primary, --primary-foreground
--destructive, --destructive-foreground
--accent, --accent-foreground
```

**Status colors** (the ONLY place semantic color is used):
- Success: `--chart-2` or a green-tinted CSS variable — never `text-green-500`
- Running/warning: amber-tinted variable — never `text-amber-500`
- Failure: `--destructive` — never `text-red-500`
- Idle/neutral: `--muted-foreground`

Define status colors as CSS variables in the theme so they adapt to dark/light:
```css
:root {
  --status-success: oklch(0.72 0.15 155);
  --status-running: oklch(0.75 0.15 75);
  --status-failure: oklch(0.65 0.2 25);
}
.dark {
  --status-success: oklch(0.65 0.18 155);
  --status-running: oklch(0.7 0.18 75);
  --status-failure: oklch(0.6 0.22 25);
}
```

## Typography

- **Monospace for data**: log entries, commit hashes, file paths, durations, timestamps
- **Sans-serif for UI**: labels, headers, buttons, navigation, badges
- Fluid scaling via `clamp()`: body `clamp(0.75rem, 1.2vw, 0.875rem)`, headings proportional
- Markdown content: `@tailwindcss/typography` with `prose prose-sm dark:prose-invert`

## Layout — Single CSS Grid, No Nesting Hacks

The entire dashboard is **one CSS Grid** with named areas. This guarantees the sticky footer, individually scrollable panels, and no layout math bugs.

```
┌─────────────────────────────────────────────────────────────┐
│ sidebar  │  header                                          │
│          ├──────────────────────┬────────────────────────────│
│          │  docs                │  activity                  │
│          │  (scrolls)           │  (scrolls)                 │
│          │                      │                            │
│          │                      │                            │
├──────────┴──────────────────────┴────────────────────────────│
│ footer (sticky — always visible at bottom)                   │
└─────────────────────────────────────────────────────────────┘
```

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "sidebar header  header"
    "sidebar docs    activity"
    "footer  footer  footer";
  height: 100vh;           /* or 100dvh for mobile */
  overflow: hidden;        /* grid controls all scrolling */
}

/* Each content panel scrolls independently */
.panel-docs     { grid-area: docs;     overflow-y: auto; }
.panel-activity { grid-area: activity; overflow-y: auto; }
.panel-sidebar  { grid-area: sidebar;  overflow-y: auto; }

/* Footer is a grid row — it CANNOT scroll away */
.panel-footer   { grid-area: footer; }

/* Header is a grid row — it CANNOT scroll away */
.panel-header   { grid-area: header; }
```

**Key rules:**
- `height: 100vh` + `overflow: hidden` on the grid container — the grid owns all scrolling
- Each panel has `overflow-y: auto` — panels scroll independently
- Footer is a grid row, not a positioned element — it's structurally impossible for it to not stick
- No `position: sticky`, no `position: fixed`, no `calc(100vh - ...)` hacks
- The ResizablePanel between docs and activity is fine inside the grid cell — it only controls the horizontal split between those two panels
- Sidebar width: controlled by shadcn `Sidebar` component (which handles collapse animation internally)

**Responsive (<768px):**
```css
@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      "header"
      "docs"
      "activity"
      "footer";
  }
  .panel-sidebar { display: none; } /* use sheet/drawer instead */
}
```

## Spacing System

Use a consistent 4px base:
- `gap-1` (4px) — between inline elements, badge internals
- `gap-2` (8px) — between list items, log rows
- `gap-3` (12px) — between sections, panel padding
- `gap-4` (16px) — major section breaks

No mixing. Pick one gap size per context and use it consistently within that component.

## Component Rules

| Element | Use | Never |
|---------|-----|-------|
| Icons | `lucide-react` | Unicode symbols (▶ ▸ ▾ ● ✓ ✗) |
| Badges | shadcn `Badge` with variants | Hand-rolled colored spans |
| Sidebar | shadcn `Sidebar` + `SidebarProvider` | Conditional `ResizablePanel` rendering |
| Tooltips | shadcn `Tooltip` | `title` attributes |
| Collapsible | shadcn `Collapsible` + lucide chevron | Unicode triangles as triggers |
| Scrolling | `overflow-y: auto` on grid cells | shadcn `ScrollArea` wrapping entire panels (double scroll) |
| Status dots | Lucide `Circle` icon with status color fill | `●` character with hardcoded color |
| Buttons | shadcn `Button` with correct variant | Unstyled `<button>` or `<a>` as button |

## Panel-Specific Notes

### Sidebar
- shadcn `Sidebar` component — handles collapse, mobile sheet, keyboard
- Tree: repo > project > issue > session
- Collapse trigger: `SidebarTrigger` (visible chevron icon)
- Active session: accent background + running indicator (lucide `Loader2` spinning, or pulsing dot)
- Inactive sessions: muted text

### Header
- Session name, iteration badge, phase badge, provider health badges
- Progress bar: thin accent-colored bar below the header showing % tasks complete
- Compact single row — no wrapping

### Docs Panel
- Tabbed: `Tabs` component with doc names
- Content: `prose prose-sm dark:prose-invert` for markdown
- TODO.md: GFM task list checkboxes styled, current task highlighted
- Panel scrolls independently (grid cell `overflow-y: auto`)

### Activity Log
- Each entry: flex row that wraps at narrow widths
- Date group headers: bold label with subtle top border
- Running entry: left accent border (status-running color), live timer ticking
- Commit rows: expandable via `Collapsible` with chevron icon
- Panel scrolls independently (grid cell `overflow-y: auto`)

### Footer (Steer/Stop Bar)
- Grid row — structurally pinned to bottom, never scrolls
- Input: auto-growing textarea (1→4 lines), Enter to send, Shift+Enter for newline
- Buttons: Send (primary), Stop (destructive), Force Stop (outline)
- Subtle top border or shadow to separate from content

## Animations

- `prefers-reduced-motion`: disable all animations when set
- Running pulse: subtle opacity pulse on status indicator (not the whole row)
- Collapse/expand: smooth height transition (shadcn handles this)
- Panel resize: instant (no transition — drag should feel immediate)
- No bouncing, no sliding, no spring physics

## What NOT to Do

- No gradients, no shadows heavier than `shadow-sm`, no rounded corners larger than `rounded-lg`
- No centered layouts — everything left-aligned, top-down vertical scan
- No loading skeletons for initial load (use a simple spinner) — skeletons are for content that re-fetches
- No empty state illustrations — use a single line of muted text
- No toast notifications for routine events (phase transitions) — only for errors or user actions
- No modals except command palette and image lightbox
