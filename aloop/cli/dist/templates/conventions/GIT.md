# Git & PR Conventions

> This file is seeded by `aloop setup` and should be customized for your project.
> Agents read this file to enforce consistent version control practices.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
type(scope): short description

Optional body explaining WHY, not WHAT.

BREAKING CHANGE: description (if applicable)
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

- Subject line: **<= 72 characters**, imperative mood, no period.
- Body: wrap at 80 characters. Explain motivation, not mechanics.
- Breaking changes: use `feat!:` or `BREAKING CHANGE:` footer.

Why: Machine-readable commits enable automated changelogs, semantic versioning, and better git archaeology.

## Branch Naming

```
type/short-description
type/TICKET-123-short-description
```

- Types: `feature/`, `fix/`, `hotfix/`, `chore/`, `refactor/`
- Lowercase, hyphen-separated. No spaces, no uppercase.
- Include ticket/issue ID when available.
- Branches should be **short-lived** — merge within days, not weeks.

## Pull Requests

- **Target: < 200 lines changed.** Review quality drops sharply above this. ([Google: Small CLs](https://google.github.io/eng-practices/review/developer/))
- **Hard limit: 400 lines.** Above this, split into stacked PRs.
- **One concern per PR.** Don't mix refactoring with features.
- **PR title follows commit convention:** `feat(auth): add OAuth2 login flow`
- **Description must include:** what changed, why, how to test.
- **Squash merge** for feature branches (clean linear history).

## Never Do

- **Never force-push to main/master.** Shared branches have immutable history.
- **Never commit secrets.** Use `.gitignore` for `.env`, credentials, keys.
- **Never commit generated files** (build output, node_modules, dist/).
- **Never skip pre-commit hooks** without documented justification.

References:
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Google Engineering Practices: Code Review](https://google.github.io/eng-practices/review/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
