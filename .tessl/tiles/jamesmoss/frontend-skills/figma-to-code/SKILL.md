---
name: figma-to-code
description: Implement Figma designs in code with accurate layout, spacing, typography, and tokens. Use when implementing designs from Figma, translating mockups to React/CSS, or when the user mentions Figma, design specs, or Dev Mode.
---

# Implementing Figma Designs

## When to Use

Apply this skill when turning Figma mockups or specs into production UI: extracting layout, spacing, typography, colors, and components while keeping design–code alignment and accessibility.

## Workflow

1. **Clarify source**: Use Figma Dev Mode or exported specs (inspect panel) for spacing, font sizes, colors, and radii. If the user shares a link, frame name, or screenshot, work from that.
2. **Map to layout**: Translate auto layout to flexbox or grid; use padding/margin from the design (see Spacing and Sizing).
3. **Use design tokens**: Prefer shared tokens (colors, type scale, spacing, radii) over one-off values so updates stay consistent.
4. **Build in components**: Match Figma components/frames to React components; reuse existing design-system components when they match.
5. **Verify**: Check alignment, spacing, and responsive behavior; ensure focus and semantics for accessibility.

## Layout from Figma

- **Auto layout (vertical)** → `flex` with `flex-direction: column` and consistent `gap` (or `space-y-*` / `margin-top` on children).
- **Auto layout (horizontal)** → `flex` with `flex-direction: row` and `gap` (or `space-x-*`).
- **Auto layout “fill”** → `flex: 1` (or `flex-grow: 1`) so the element fills remaining space.
- **Fixed width/height in Figma** → Use the same pixel values or map to tokens (e.g. `w-[72px]` or `width: token('sizes.18')`).
- **Constraints (left/right, top/bottom)** → Map to max-width, margin, or positioning as appropriate (e.g. `max-w-7xl mx-auto` for centered, constrained width).
- **Grid-like layouts** → Use CSS Grid with column counts and gaps from the design.

## Spacing and Sizing

- **Padding** (inner): Use the values from the frame’s padding in Figma (e.g. 16px → `p-4`, 24px → `p-6`). Prefer theme spacing when available.
- **Gap** (between items in auto layout): Use the same value as “item spacing” (e.g. 8px → `gap-2`, 16px → `gap-4`).
- **Margin** (between sections): Use the spacing scale consistently (e.g. `mt-6`, `mb-8`).
- **Icon/content size**: Match icon or content size from design (e.g. 24×24 → `w-6 h-6`).

## Typography

- **Font family**: Use the font from the design; if it’s a project font, use the existing token or variable.
- **Font size**: Map to a type scale (e.g. 12px → `text-xs`, 14px → `text-sm`, 16px → `text-base`, 18px → `text-lg`, 24px → `text-2xl`). Prefer semantic names (e.g. “body”, “heading”) when the design system has them.
- **Font weight**: Map Figma weights (e.g. Regular 400, Medium 500, Semibold 600, Bold 700).
- **Line height**: Use values from Figma or the type scale (e.g. `leading-tight`, `leading-normal`, `leading-relaxed` or exact values if specified).
- **Letter spacing**: Apply if the design specifies it (e.g. `tracking-tight`, `tracking-wide` or a custom value).

## Colors

- **Fills**: Use hex or named colors from the design; map to design tokens (e.g. `primary`, `gray.700`) when they exist.
- **Text**: Use the same token/color as in the design for body, headings, and muted text.
- **Borders**: Use border color and width from the design; prefer tokens.
- **Opacity**: Respect opacity in Figma (e.g. overlays, disabled state).

## Borders, Radii, Shadows

- **Border radius**: Use corner radius from Figma (e.g. 4px → `rounded`, 8px → `rounded-lg`, 9999 → `rounded-full`). Prefer theme radii when defined.
- **Shadows**: Map elevation/shadow from Figma to theme shadows (e.g. `shadow-sm`, `shadow-md`) or match blur/offset/color if no token.

## Components and Reuse

- **Figma components** → Implement as React components. Match variants (e.g. size, type) via props.
- **Existing design system**: Use existing Button, Card, Input, etc. if they match the design; extend or wrap only when needed.
- **Icons**: Use the same icon set as in Figma (e.g. from a shared library); match size and color to the design.

## Accessibility

- Use semantic HTML and ARIA where needed (headings, landmarks, labels, live regions).
- Ensure color contrast meets WCAG for text and interactive elements.
- Preserve focus order and visible focus styles; support keyboard interaction for custom components.

## Design Tokens Pipeline (Optional)

If the project uses a token pipeline (Figma → JSON → code):

- Prefer tokens for colors, typography, spacing, radii, shadows.
- Generate or sync tokens before implementing so code uses the same values as Figma.

## Checklist

- [ ] Layout (flex/grid) matches auto layout and constraints.
- [ ] Spacing (padding, gap, margin) matches design.
- [ ] Typography (font, size, weight, line height) matches.
- [ ] Colors and opacity match; tokens used when available.
- [ ] Borders, radii, shadows match.
- [ ] Responsive behavior considered (breakpoints, wrapping).
- [ ] Accessibility: semantics, contrast, focus, keyboard.

## Example (Tailwind)

Design: Card with 24px padding, 16px gap, title 18px semibold, body 14px gray, 8px radius, light border.

```tsx
<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold text-gray-900">Card title</h2>
    <p className="text-sm text-gray-600">Card description from Figma.</p>
  </div>
</div>
```
