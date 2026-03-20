# Code Quality Conventions — Aloop

> Agents read this file to enforce consistent quality standards across the aloop codebase.

## Language & Module System

- **TypeScript strict mode** (`"strict": true` in tsconfig). No `any` unless explicitly justified with a comment.
- **ESM only** — all packages use `"type": "module"`. Use explicit `.js` extensions in imports (TypeScript resolves `.ts` to `.js`).
- **`node:` prefix** for all Node.js built-in imports: `import { readFile } from 'node:fs/promises'`.
- **Target: ES2022** — use top-level await, `structuredClone`, `Array.at()`, etc.

## Architecture Style

- **Functional architecture — no classes.** Use plain functions, closures, and object literals.
- **Dependency injection for testability.** Pass dependencies (fs, fetch, process) as function parameters with sensible defaults.
- **Pure functions at the core.** Side effects (I/O, network, file system) live at the edges.

```typescript
// Good: injectable dependency with default
export function parsePlan(
  content: string,
  opts: { readFile?: typeof fs.readFile } = {}
): LoopPlan { ... }

// Bad: class with hidden dependencies
class PlanParser {
  parse() { fs.readFileSync(...) }
}
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Variables, functions | camelCase | `parseLoopPlan`, `sessionId` |
| Types, interfaces | PascalCase | `LoopPlan`, `AgentConfig` |
| Constants | UPPER_SNAKE_CASE | `MAX_ITERATIONS`, `DEFAULT_PROVIDER` |
| Files | kebab-case | `loop-plan.ts`, `github-monitor.ts` |
| Booleans | `is`/`has`/`should` prefix | `isCompleted`, `hasPermission` |

## File & Function Size

- **Max 400 lines per file.** Decompose if exceeded.
- **Max 50 lines per function.** Extract helpers or split responsibilities.
- **Max cyclomatic complexity: 10** per function. Use early returns and guard clauses.

## Code Organization

- **Package by feature, not by layer.** Group related files together.
- **Colocate tests with source.** Test files live next to their source: `plan.ts` + `plan.test.ts`.
- **One concept per file.** A file should have a single clear purpose.
- **Minimal public API.** Each module exports only what consumers need.

### Project Directory Structure

```
aloop/
  cli/                    # TypeScript CLI (Bun-bundled)
    src/
      commands/           # CLI command handlers
      lib/                # Shared runtime library
    dashboard/            # React SPA (Vite)
      src/
        components/ui/    # shadcn UI components
        lib/              # Dashboard utilities
  bin/                    # Shell scripts (loop.sh, loop.ps1)
  agents/                 # Agent provider configs
  templates/              # Convention + prompt templates
docs/conventions/         # Project-specific conventions (this directory)
```

## Error Handling

- **Fail fast.** Validate inputs at boundaries and reject invalid state immediately.
- **No swallowed errors.** Every `catch` must handle, rethrow, or log with context.
- **Use typed errors** with actionable context (what failed, why, what to do).
- **Structured error responses** in request/response envelopes — never bare strings.

```typescript
// Good: typed error with context
throw new Error(`Failed to parse loop-plan.json: ${reason}`, { cause: err });

// Bad: swallowed error
try { parsePlan(data); } catch { /* ignore */ }
```

## Duplication & Abstraction

- **Rule of Three.** Tolerate first duplication; extract on third occurrence.
- **Composition over inheritance.** Prefer composing small functions over abstraction layers.
- **Don't abstract prematurely.** Three similar lines is better than a wrong abstraction.

## Shell Scripts (loop.sh / loop.ps1)

- Shell scripts follow POSIX sh conventions (loop.sh) or PowerShell 5.1 compatibility (loop.ps1).
- **No TypeScript logic leaks into shell.** The boundary contract is file-based (JSON, JSONL, markdown).
- PowerShell: avoid `($var text)` pattern — use `$($var)` subexpression syntax.
- Prefer `jq` for JSON manipulation in shell; avoid inline parsing hacks.

## General Principles

- **YAGNI** — Don't build it until you need it.
- **KISS** — Choose the simplest solution that works.
- **Single Responsibility** — A module should have one reason to change.
- **Dependency Inversion** — Depend on abstractions at boundaries.
- **Least Surprise** — Code should behave the way a reader would expect.

## Linting & Formatting

- **TypeScript:** `tsc --noEmit` for type checking. No separate linter configured yet — rely on strict TS.
- **Import order:** node builtins first, external packages second, local imports last. Blank line between groups.

References:
- [ESLint max-lines](https://eslint.org/docs/latest/rules/max-lines)
- [Airbnb Style Guide](https://github.com/airbnb/javascript#naming-conventions)
- [Martin Fowler: Refactoring](https://refactoring.com/)
