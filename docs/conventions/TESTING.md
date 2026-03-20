# Testing Conventions — Aloop

> Agents read this file to enforce consistent testing standards across the aloop codebase.

## Test Frameworks by Layer

| Layer | Framework | Runner | Notes |
|-------|-----------|--------|-------|
| CLI (`aloop/cli/src/`) | `node:test` + `node:assert/strict` | `tsx --test` | No external test framework |
| Dashboard (`aloop/cli/dashboard/`) | Vitest + Testing Library | `vitest run` | `@testing-library/react` for components |
| Dashboard E2E | Playwright | `playwright test` | Full browser tests |
| Dashboard components | Storybook | `storybook dev` | Visual isolation + interaction tests |
| Shell scripts (`aloop/bin/`) | Bash test files / PowerShell Pester | Direct execution | `*.tests.sh`, `*.tests.ps1` |

## CLI Tests (node:test)

Use the built-in Node.js test runner. No Jest, no Mocha, no Vitest for CLI code.

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from './plan.js';

describe('parsePlan', () => {
  it('returns cycle array from valid JSON', () => {
    const plan = parsePlan('{"cycle": ["build.md"]}');
    assert.deepStrictEqual(plan.cycle, ['build.md']);
  });
});
```

- Run with: `tsx --test src/**/*.test.ts`
- Test files live next to source: `plan.ts` + `plan.test.ts`

## Dashboard Tests (Vitest + Testing Library)

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders session list', () => {
    render(<App />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });
});
```

- Run with: `npm --prefix aloop/cli/dashboard run test`
- Coverage: `vitest run --coverage` (v8 + istanbul providers available)
- JSDOM environment for component tests
- Use `@testing-library/jest-dom` matchers

## E2E Tests (Playwright)

- Run with: `npm --prefix aloop/cli/dashboard run test:e2e`
- Test critical user journeys: session creation, log viewing, steering
- Keep E2E tests minimal — one per feature's happy path

## Test-Driven Workflow

- **Write tests before or alongside code, never as an afterthought.** Every feature or fix includes tests in the same commit.
- **Red-Green-Refactor.** Write a failing test, make it pass with minimal code, then clean up.
- **Tests are first-class code.** Same quality standards as production code.

## What to Test

- **Mostly integration tests.** Test behavior through public interfaces, not internal implementation.
- **Unit test complex logic.** Parsers (`yaml.ts`, `parseTodoProgress.ts`), validators, state machines.
- **At least one E2E journey per dashboard feature.**
- **Don't test framework internals.** Trust that React renders, Vite bundles, etc.

## Test Structure (AAA)

- **Arrange, Act, Assert.** Separate the three phases with blank lines.
- **One behavior per test.** If a test name has "and" in it, split it.
- **Descriptive names:** `"returns 404 when user not found"` not `"test getUserById"`.

## Mocking Strategy

- **Hand-rolled mocks via dependency injection.** No global mock libraries for CLI code.
- **Pass dependencies as function parameters** with defaults pointing to real implementations.
- **Mock at system boundaries only:** file system, network, external CLIs.

```typescript
// Good: injectable file system
function loadPlan(planPath: string, deps = { readFile: fs.readFile }) {
  return deps.readFile(planPath, 'utf-8');
}

// In tests:
it('handles missing file', async () => {
  const readFile = async () => { throw new Error('ENOENT'); };
  await assert.rejects(() => loadPlan('/x', { readFile }));
});
```

- **Dashboard:** Use MSW for HTTP mocking when testing API interactions.
- **Never mock the unit under test.**

## Test Isolation

- **Temp directories for file system tests.** Create with `mkdtemp`, clean up in `after()`.
- **Each test creates its own data.** No shared mutable state between tests.
- **Tests must pass in any order** and when run individually.
- **No sleep/timers in tests.** Use fake timers or wait-for utilities.

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'aloop-test-'));
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
```

## Shell Script Tests

- Bash tests: `aloop/bin/*.tests.sh` — test path hardening, JSON escaping, provenance trailers.
- PowerShell tests: `aloop/bin/*.tests.ps1`, `install.tests.ps1` — Pester-style.
- Shell tests validate the boundary contract: correct JSON output, correct file writes.

## Coverage

- **Target: >= 80% line coverage** on new/touched code.
- **Do NOT chase 100%.** Diminishing returns.
- **Cover the critical path first:** plan compilation, request processing, status updates, provider invocation.
- **Branch coverage >= 70%** as supplementary metric.

References:
- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [Vitest](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Playwright](https://playwright.dev/)
- [Kent C. Dodds: Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
