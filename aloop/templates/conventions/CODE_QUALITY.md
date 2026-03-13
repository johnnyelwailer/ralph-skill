# Code Quality Conventions

> This file is seeded by `aloop setup` and should be customized for your project.
> Agents read this file to enforce consistent quality standards.

## File & Function Size

- **Max 400 lines per file.** Files exceeding this must be decomposed.
- **Max 50 lines per function/method.** Extract helpers or split responsibilities.
- **Max cyclomatic complexity: 10** per function. Flatten nested conditionals with early returns, guard clauses, or strategy pattern.

Why: Large files/functions correlate with higher defect density and slower reviews. ([ESLint max-lines](https://eslint.org/docs/latest/rules/max-lines), [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html))

## Code Organization

- **Package by feature, not by layer.** Group related files together (`user/`, `billing/`) rather than by type (`controllers/`, `models/`).
- **Colocate related code.** Tests live next to source. Styles live next to components. Types live next to the code that uses them.
- **One concept per file.** A file should have a single clear purpose reflected in its name.
- **Public API surface.** Each module should export a clear, minimal interface. Internal helpers stay unexported.

Why: Feature-based organization scales better and reduces the number of files touched per change. ([Robert C. Martin: Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html))

## Naming

- Names must be **descriptive and unambiguous**. Avoid abbreviations except universally understood ones (`id`, `url`, `http`).
- Use the project's casing convention consistently (e.g., `camelCase` for JS/TS, `snake_case` for Python/Rust).
- Booleans: prefix with `is`, `has`, `should`, `can` (e.g., `isActive`, `hasPermission`).
- Functions: use verbs (`getUser`, `validateInput`, `handleClick`).

Why: Bad names are the #1 source of confusion in code review. ([Airbnb Style Guide](https://github.com/airbnb/javascript#naming-conventions))

## Error Handling

- **Fail fast.** Validate inputs at boundaries and reject invalid state immediately.
- **Don't swallow errors.** Every `catch` must either handle, rethrow, or log with context.
- **Use typed/structured errors** where the language supports it. Include actionable context (what failed, why, what to do).
- **Blast radius containment.** Failures in one subsystem should not crash the whole application.

Why: Silent failures cause cascading bugs that are expensive to diagnose. ([Martin Fowler: Fail Fast](https://www.martinfowler.com/ieeeSoftware/failFast.pdf))

## Duplication & Abstraction

- **Rule of Three.** Tolerate first duplication; extract on third occurrence.
- **Don't abstract prematurely.** Three similar lines of code is better than a premature abstraction.
- **Composition over inheritance.** Prefer composing small, focused units over deep inheritance chains.

Why: Wrong abstractions are harder to fix than duplication. ([Sandi Metz: The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction))

## General Principles

- **YAGNI** — Don't build it until you need it. No speculative features.
- **KISS** — Choose the simplest solution that works. Complexity must be justified.
- **Single Responsibility** — A module should have one reason to change.
- **Dependency Inversion** — Depend on abstractions at boundaries, not concrete implementations.
- **Least Surprise** — Code should behave the way a reader would expect.
- **Tell, Don't Ask** — Objects should encapsulate behavior, not expose state for callers to act on.

References:
- [Google Engineering Practices: Code Review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [SOLID Principles (Wikipedia)](https://en.wikipedia.org/wiki/SOLID)
- [Martin Fowler: Refactoring](https://refactoring.com/)
