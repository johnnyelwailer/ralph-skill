# Versions

Authoritative dependency and runtime version table for this project.
Review Gate 8 validates actual installed versions against this table.
Major version mismatches are a gate failure; minor/patch differences are acceptable.

## Runtime

| Component  | Version |
|------------|---------|
| Node.js    | 22.x (ES2022 target) |
| Bash       | 5.x     |
| TypeScript | 5.6.3   |
| Git        | 2.x     |

## CLI (`aloop/cli`)

### Production Dependencies

| Package   | Version |
|-----------|---------|
| commander | 12.0.0  |

### Dev Dependencies

| Package    | Version |
|------------|---------|
| esbuild    | 0.20.0  |
| tsx        | 4.x     |
| typescript | 5.6.3   |

## Dashboard (`aloop/cli/dashboard`)

### Production Dependencies

| Package                        | Version |
|--------------------------------|---------|
| react                          | 18.3.1  |
| react-dom                      | 18.3.1  |
| tailwindcss                    | 3.4.14  |
| marked                         | 15.x    |
| lucide-react                   | 0.577.0 |
| @radix-ui/react-dropdown-menu  | 2.x     |
| @radix-ui/react-tabs           | 1.x     |
| @radix-ui/react-tooltip        | 1.x     |
| @radix-ui/react-hover-card     | 1.x     |
| @radix-ui/react-collapsible    | 1.x     |
| @radix-ui/react-progress       | 1.x     |
| @radix-ui/react-scroll-area    | 1.x     |
| class-variance-authority       | 0.7.x   |
| clsx                           | 2.x     |
| cmdk                           | 1.1.1   |
| react-resizable-panels         | 4.x     |
| sonner                         | 2.0.7   |
| tailwind-merge                 | 2.x     |

### Dev Dependencies

| Package                     | Version |
|-----------------------------|---------|
| vite                        | 5.4.10  |
| vitest                      | 4.1.0   |
| typescript                  | 5.6.3   |
| @playwright/test            | 1.51.0  |
| @vitejs/plugin-react        | 4.x     |
| @testing-library/react      | 16.x    |
| @testing-library/jest-dom   | 6.x     |
| jsdom                       | 29.x    |
| autoprefixer                | 10.x    |
| postcss                     | 8.x     |
| @storybook/*                | 8.x     |

## Version Policy

- **Strategy:** latest stable versions, pinned in lockfiles.
- **Node target:** ES2022+ (matches Node 22.x runtime).
- **React:** 18.x — not yet migrated to React 19.
- **Gate validation:** Review Gate 8 checks installed versions against this table.
  Major mismatches fail the gate; minor/patch drift is acceptable.
