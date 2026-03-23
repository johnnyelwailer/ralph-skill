---
name: tailwind
description: Apply Tailwind CSS utility-first styling, responsive design, and theming. Use when styling with Tailwind, building UI with utility classes, configuring tailwind.config, or when the user mentions Tailwind.
---

# Tailwind CSS

## When to Use

Apply this skill when writing or refactoring styles with Tailwind CSS: components, pages, layout, responsive behavior, dark mode, or Tailwind config.

## Principles

1. **Utility-first**: Prefer utility classes over custom CSS. Compose layout, spacing, typography, and colors from Tailwind classes.
2. **Design tokens**: Use theme values (e.g. `bg-primary`, `text-sm`, `rounded-lg`) instead of arbitrary values unless the design explicitly requires a one-off value.
3. **Responsive**: Use responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) for breakpoint-specific styles. Mobile-first: base classes for smallest viewport, then override up.
4. **Extract components sparingly**: Prefer keeping utilities in the template. Use `@apply` only for repeated patterns (e.g. a shared button variant) and keep `@apply` lists short.

## Common Patterns

### Layout

- **Flex**: `flex`, `flex-col` / `flex-row`, `items-center`, `justify-between`, `gap-4`, `flex-1`, `flex-wrap`.
- **Grid**: `grid`, `grid-cols-2`, `grid-cols-3`, `gap-4`, `col-span-2`, `place-items-center`.
- **Spacing**: `p-4`, `px-6`, `py-2`, `m-auto`, `space-x-4` / `space-y-2` (for gaps between siblings).

### Typography

- **Size**: `text-xs` through `text-5xl`, `text-base` (default).
- **Weight**: `font-normal`, `font-medium`, `font-semibold`, `font-bold`.
- **Color**: `text-gray-900`, `text-white`, `text-inherit`. Prefer semantic tokens if defined in theme.
- **Line height**: `leading-tight`, `leading-normal`, `leading-relaxed`.

### Colors and Backgrounds

- **Background**: `bg-white`, `bg-gray-100`, `bg-transparent`.
- **Borders**: `border`, `border-gray-200`, `rounded-md`, `rounded-full`.
- **Opacity**: `opacity-50`, `bg-black/10` (arbitrary opacity).

### Interactivity and State

- **Hover/focus**: `hover:bg-gray-100`, `focus:ring-2`, `focus:outline-none`, `focus-visible:ring-2`.
- **Disabled**: `disabled:opacity-50`, `disabled:pointer-events-none`.
- **Transitions**: `transition`, `transition-colors`, `duration-200`.

### Dark Mode

- Use `dark:` prefix when dark mode is enabled (e.g. `dark:bg-gray-800`, `dark:text-gray-200`).
- Ensure sufficient contrast and test both modes.

### Arbitrary Values

- Use when theme doesn’t cover the value: `w-[137px]`, `top-[calc(100%-2rem)]`, `bg-[#1a1a2e]`.
- Prefer extending `tailwind.config` with named tokens for repeated values.

## Config

- **Custom tokens**: Add in `theme.extend` (e.g. `colors`, `spacing`, `fontFamily`, `borderRadius`) so they’re available as utilities.
- **Content paths**: Ensure `content` in `tailwind.config` includes all template/component paths so classes are generated.
- **Plugins**: Use official plugins (e.g. `@tailwindcss/forms`, `@tailwindcss/typography`) when needed; document any custom plugins.

## What to Avoid

- Long `@apply` chains; prefer utilities in markup or small, focused components.
- Inline styles for things Tailwind can do (e.g. use `w-4 h-4` instead of `style={{ width: 16, height: 16 }}` when possible).
- Mixing unrelated spacing scales; stick to Tailwind’s spacing scale unless the design system defines another.

## Example

```tsx
// Card with responsive layout and hover
<div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Title</h2>
  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Description.</p>
  <div className="mt-4 flex gap-2">
    <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
      Primary
    </button>
    <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
      Secondary
    </button>
  </div>
</div>
```
