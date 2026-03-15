# Versions

Authoritative dependency and runtime version table for this project.
Review Gate 8 validates actual installed versions against this table.
Major version mismatches are a gate failure; minor/patch differences are acceptable.

## Runtime

| Component | Version |
|-----------|---------|
| Node.js   | 22.x    |
| Bash      | 5.x     |
| TypeScript| 5.x     |

## CLI (`aloop/cli`)

### Production Dependencies

| Package   | Version |
|-----------|---------|
| commander | 12.x   |

### Dev Dependencies

| Package    | Version |
|------------|---------|
| esbuild    | 0.20.x |
| tsx        | 4.x    |
| typescript | 5.x    |

## Dashboard (`aloop/cli/dashboard`)

### Production Dependencies

| Package                        | Version |
|--------------------------------|---------|
| react                          | 18.x   |
| react-dom                      | 18.x   |
| tailwindcss                    | 3.x    |
| marked                         | 15.x   |
| lucide-react                   | 0.577.x|
| @radix-ui/react-dropdown-menu  | 2.x    |
| @radix-ui/react-tabs           | 1.x    |
| @radix-ui/react-tooltip        | 1.x    |
| @radix-ui/react-hover-card     | 1.x    |
| @radix-ui/react-collapsible    | 1.x    |
| @radix-ui/react-progress       | 1.x    |
| @radix-ui/react-scroll-area    | 1.x    |
| class-variance-authority       | 0.7.x  |
| clsx                           | 2.x    |
| cmdk                           | 1.x    |
| react-resizable-panels         | 4.x    |
| sonner                         | 2.x    |
| tailwind-merge                 | 2.x    |

### Dev Dependencies

| Package                     | Version |
|-----------------------------|---------|
| vite                        | 5.x    |
| vitest                      | 4.x    |
| typescript                  | 5.x    |
| @playwright/test            | 1.x    |
| @vitejs/plugin-react        | 4.x    |
| @testing-library/react      | 16.x   |
| @testing-library/jest-dom   | 6.x    |
| jsdom                       | 29.x   |
| autoprefixer                | 10.x   |
| postcss                     | 8.x    |
