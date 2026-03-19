# Testing Conventions

> This file is seeded by `aloop setup` and should be customized for your project.
> Agents read this file to enforce consistent testing standards.

## Test-Driven Workflow

- **Write tests before or alongside code, never as an afterthought.** Every feature or fix should include tests in the same commit.
- **Red-Green-Refactor.** Write a failing test, make it pass with minimal code, then clean up.
- **Tests are first-class code.** They deserve the same quality standards as production code.

Why: Tests written after the fact tend to verify implementation rather than behavior. ([Kent C. Dodds: Write Tests](https://kentcdodds.com/blog/write-tests))

## What to Test

- **Mostly integration tests.** Test behavior through public interfaces, not internal implementation.
- **Unit test complex logic.** Algorithms, parsers, validators, state machines — anything with branching logic.
- **At least one E2E journey per feature.** Verify the critical user path works end-to-end.
- **Don't test framework internals.** Trust that React renders, Express routes, etc.

Why: Integration tests give the best confidence-to-maintenance ratio. ([Kent C. Dodds: Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications), [Martin Fowler: Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html))

## Test Structure

- **AAA pattern: Arrange, Act, Assert.** Separate the three phases with blank lines.
- **One behavior per test.** If a test name has "and" in it, split it.
- **Descriptive names:** `"returns 404 when user not found"` not `"test getUserById"`.
- **Use "when... then..." pattern** for complex scenarios.

Example:
```
test("returns 404 when user does not exist", () => {
  // Arrange
  const userId = "nonexistent-id";

  // Act
  const response = await getUser(userId);

  // Assert
  expect(response.status).toBe(404);
});
```

Why: Good test names are living documentation. When a test fails, the name should explain what broke. ([Goldberg: JS Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices))

## Coverage

- **Target: >= 80% line coverage** on touched/new code. Not a vanity metric — a safety net.
- **Do NOT chase 100%.** Diminishing returns; incentivizes testing implementation details.
- **Cover the critical path first.** Payment flows, auth, data mutations > UI tweaks.
- **Branch coverage >= 70%** as supplementary metric.

Why: Coverage is a useful negative indicator (low = undertested) but poor positive indicator (high != well-tested). ([Kent C. Dodds: How to know what to test](https://kentcdodds.com/blog/how-to-know-what-to-test))

## Mocking

- **Mock at system boundaries only:** network, database, file system, external APIs.
- **Don't mock what you own.** If you control the code, test through it, not around it.
- **Use MSW/nock for HTTP mocking.** Intercept at the network layer, not the function layer.
- **Never mock the unit under test.**

Why: Over-mocking creates tests that pass when the system is broken. ([Kent C. Dodds: Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details))

## Test Isolation

- **Each test creates its own data.** No shared mutable state between tests.
- **Tests must pass in any order** and when run individually.
- **Clean up in afterEach.** Reset mocks, clear databases, restore stubs.
- **No sleep/timers in tests.** Use fake timers or wait-for utilities.

References:
- [Goldberg: JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Martin Fowler: Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html)
- [web.dev: Testing Strategies](https://web.dev/articles/ta-strategies)
