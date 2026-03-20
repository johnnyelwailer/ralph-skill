# Git & PR Conventions — Aloop

> Agents read this file to enforce consistent version control practices.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
type(scope): short description

Optional body explaining WHY, not WHAT.

BREAKING CHANGE: description (if applicable)
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

Scopes (project-specific):
- `loop` — loop.sh / loop.ps1 inner loop scripts
- `cli` — aloop CLI TypeScript code
- `dash` — dashboard React SPA
- `orch` — orchestrator
- `spec` — SPEC.md or specification changes
- `agents` — agent YAML configs or prompt templates
- `setup` — aloop setup command
- `conventions` — convention docs

Rules:
- Subject line: **<= 72 characters**, imperative mood, no period.
- Body: wrap at 80 characters. Explain motivation, not mechanics.
- Breaking changes: use `feat!:` or `BREAKING CHANGE:` footer.

## Provenance Trailers

Agent-authored commits must include provenance trailers in the commit message footer:

```
feat(cli): add provider health monitoring

Detect and track provider rate limits across sessions.

Aloop-Agent: claude
Aloop-Iteration: 7
Aloop-Session: abc123
```

- **Aloop-Agent** — which agent/provider authored the commit
- **Aloop-Iteration** — iteration number within the loop
- **Aloop-Session** — session ID for traceability

These trailers are appended by the loop scripts automatically. Human commits do not include them.

## Branch Naming

```
type/short-description
type/ISSUE-123-short-description
```

- Types: `feature/`, `fix/`, `hotfix/`, `chore/`, `refactor/`
- Lowercase, hyphen-separated. No spaces, no uppercase.
- Include issue ID when working from GitHub issues (orchestrator mode).
- Branches should be **short-lived** — merge within days, not weeks.

## Pull Requests

- **Target: < 200 lines changed.** Review quality drops sharply above this.
- **Hard limit: 400 lines.** Above this, split into stacked PRs.
- **One concern per PR.** Don't mix refactoring with features.
- **PR title follows commit convention:** `feat(cli): add provider health monitoring`
- **Description must include:** what changed, why, how to test.
- **Squash merge** for feature branches (clean linear history).

## Orchestrator PRs

In orchestrator mode, child loops create PRs per GitHub issue:
- Branch: `feature/ISSUE-N-description` (auto-created)
- PR links back to the originating issue
- PR must pass CI gates before merge
- Orchestrator handles merge sequencing across waves

## Never Do

- **Never force-push to main/master.** Shared branches have immutable history.
- **Never commit secrets.** Use `.gitignore` for `.env`, credentials, keys.
- **Never commit generated files** (`dist/`, `node_modules/`, build output).
- **Never skip pre-commit hooks** without documented justification.
- **Never commit `active.json` or session state** — these are runtime artifacts.

## Always Do After Committing

- **Push after every commit.** Don't leave commits sitting locally.
- This ensures CI runs, dashboards update, and collaborators see progress.

References:
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Google Engineering Practices: Code Review](https://google.github.io/eng-practices/review/)
