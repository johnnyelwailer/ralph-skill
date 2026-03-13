# Software Engineering Conventions Reference

Compiled from authoritative sources. All URLs verified via web search.

---

## 1. Code Quality (Language-Agnostic)

### File Size Limits (LOC)

| Convention | Threshold | Source |
|---|---|---|
| ESLint `max-lines` default | 300 lines per file | [ESLint max-lines](https://eslint.org/docs/latest/rules/max-lines) |
| Google style guides | Files should be focused on a single theme; no hard numeric cap but small is preferred | [Google Style Guides](https://google.github.io/styleguide/) |
| Common industry range | 100-500 lines; 300 is a practical default | Multiple style guides |

**Why it matters:** Large files are harder to navigate, review, and test. Keeping files focused improves discoverability and reduces merge conflicts.

### Function/Method Size Limits

| Convention | Threshold | Source |
|---|---|---|
| ESLint `max-lines-per-function` default | 50 lines | [ESLint max-lines-per-function](https://eslint.org/docs/latest/rules/max-lines-per-function) |
| Google C++ Style Guide | ~40 lines; think about splitting if exceeded | [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html) |
| Google (inline functions) | 10 lines or less | Same source |

**Why it matters:** Short functions are easier to name, test, reuse, and reason about. They naturally enforce single responsibility.

### Cyclomatic Complexity

| Convention | Threshold | Source |
|---|---|---|
| McCabe / NIST recommended | <= 10 per function | [Wikipedia: Cyclomatic Complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity) |
| Relaxed threshold (experienced teams) | <= 15 | NIST Structured Testing methodology |
| SonarQube cognitive complexity default | <= 15 | [SonarQube S3776 rule](https://next.sonarqube.com/sonarqube/coding_rules?languages=cpp&q=cognitive&open=cpp:S3776) |
| Alarm threshold | > 20 is a code smell | [Microsoft Code Metrics](https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-cyclomatic-complexity?view=vs-2022) |

**Why it matters:** High complexity correlates with defect density and makes code untestable. Functions with complexity > 20 are empirically associated with higher bug rates.

### Single Responsibility

| Convention | Description | Source |
|---|---|---|
| SRP (SOLID) | A module should have one, and only one, reason to change | Robert C. Martin, *Clean Code* |
| Google code review guideline | Reviewers check for "complexity" -- can it be simpler? | [Google Eng Practices: What to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html) |
| File content focus | File contents should be focused on a single theme | [Google Kotlin Style Guide](https://developer.android.com/kotlin/style-guide) |

**Why it matters:** Modules with multiple responsibilities become change magnets -- modifications for one concern risk breaking another.

### Naming Conventions

| Convention | Description | Source |
|---|---|---|
| Be descriptive, avoid abbreviations | Avoid single-letter names; name should convey intent | [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript#naming-conventions) |
| camelCase for variables/functions | PascalCase for classes/components, UPPER_SNAKE for constants | [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html) |
| No leading underscores for "private" | JS properties are fully public; underscore prefix is misleading | [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript#naming--leading-underscore) |

**Why it matters:** Consistent naming reduces cognitive load and makes code searchable. Bad names are the #1 source of confusion in code review.

### DRY / Duplication Thresholds

| Convention | Threshold | Source |
|---|---|---|
| SonarQube default (new code) | < 3% duplication | SonarQube Quality Gates |
| General principle | Duplicate code 3+ times -> extract | *The Pragmatic Programmer*, Hunt & Thomas |
| Rule of Three | Tolerate first duplication; refactor on third occurrence | Martin Fowler, *Refactoring* |

**Why it matters:** Duplicated code means duplicated bugs. Changes must be applied in multiple places, increasing risk of inconsistency.

### Key References for Domain 1

- [Google Style Guides (all languages)](https://google.github.io/styleguide/)
- [Google Engineering Practices](https://google.github.io/eng-practices/review/)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [ESLint Rules Reference](https://eslint.org/docs/latest/rules/)
- [Microsoft Code Metrics](https://learn.microsoft.com/en-us/visualstudio/code-quality/code-metrics-cyclomatic-complexity?view=vs-2022)

---

## 2. Frontend / UI

### Component Size Limits

| Convention | Threshold | Source |
|---|---|---|
| Recommended max | 150-200 lines per component | Industry consensus across React best practices guides |
| One component, one function | Each component should do one thing | [React docs: Thinking in React](https://react.dev/learn/thinking-in-react) |
| Folder nesting | Max 2 levels deep | [Robin Wieruch: React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) |

**Why it matters:** Oversized components are hard to test, hard to reuse, and create implicit coupling between unrelated UI concerns.

### Component Composition Patterns

| Convention | Description |
|---|---|
| Composition over configuration | Prefer children/render props over large prop APIs |
| Extract logic to custom hooks | Separate stateful logic from presentation |
| Container/Presentational split | Keep data-fetching separate from rendering |
| Avoid deep nesting | Flatten component trees; extract early |

**Why it matters:** Composition enables reuse without inheritance. Logic extraction enables testing without rendering.

### State Management Conventions

| Convention | Description | Source |
|---|---|---|
| Colocate state | Keep state as close to where it's used as possible | Kent C. Dodds: State Colocation |
| Server state vs client state | Use React Query / TanStack Query for server state; Zustand/Redux for client state | Industry consensus |
| Minimize global state | Only lift state that truly needs to be shared | React docs |
| Redux for complex apps | When you need middleware, devtools, time-travel debugging | [Redux Style Guide](https://redux.js.org/style-guide/) |

**Why it matters:** Over-globalized state creates invisible dependencies and makes components harder to test in isolation.

### Accessibility (WCAG)

| Convention | Threshold | Source |
|---|---|---|
| WCAG 2.1 Level AA | Minimum conformance target for most projects | [W3C WCAG 2.1](https://www.w3.org/TR/WCAG21/) |
| Four principles | Perceivable, Operable, Understandable, Robust | [WCAG 2 Overview (W3C WAI)](https://www.w3.org/WAI/standards-guidelines/wcag/) |
| Semantic HTML first | Use native elements before ARIA | [MDN: Understanding WCAG](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG) |
| Color contrast | 4.5:1 for normal text, 3:1 for large text (AA) | WCAG 2.1 SC 1.4.3 |
| Keyboard navigation | All interactive elements must be keyboard accessible | WCAG 2.1 SC 2.1.1 |

**Why it matters:** Accessibility is both a legal requirement (ADA, EU Accessibility Act) and affects ~15% of the global population. WCAG AA is the de facto standard.

### CSS/Styling Conventions

| Convention | Description | Source |
|---|---|---|
| Utility-first (Tailwind) | Compose styles from utility classes; extract components for repeated patterns | [Tailwind CSS: Utility-First](https://tailwindcss.com/docs/utility-first) |
| CSS-in-JS (Styled Components) | Co-locate styles with components; avoids global scope collisions | [Airbnb CSS-in-JavaScript](https://airbnb.io/javascript/css-in-javascript/) |
| Avoid global styles | Scope styles to components to prevent side effects | Both approaches |
| Design tokens | Use a token system (colors, spacing, typography) for consistency | Industry consensus |

**Why it matters:** Styling approach affects maintainability, performance, and team velocity. The key is consistency within a project.

### Performance

| Convention | Threshold | Source |
|---|---|---|
| Core Web Vitals: LCP | <= 2.5 seconds | [web.dev: Web Vitals](https://web.dev/articles/vitals) |
| Core Web Vitals: INP | <= 200 milliseconds | [web.dev: Core Web Vitals](https://web.dev/explore/learn-core-web-vitals) |
| Core Web Vitals: CLS | <= 0.1 | Same source |
| JS bundle budget | < 200-300 KB compressed total; individual chunks < 50 KB | [Smashing Magazine: Code Splitting](https://www.smashingmagazine.com/2022/02/javascript-bundle-performance-code-splitting/) |
| Lazy load below-fold content | Route-based code splitting as baseline | React.lazy() / dynamic imports |
| Tree shaking | Use ES modules; eliminate dead code | Webpack/Vite defaults |

**Why it matters:** Performance directly impacts user retention, SEO ranking, and Core Web Vitals scores. Google uses CWV as a ranking factor.

### Key References for Domain 2

- [web.dev Performance](https://web.dev/performance)
- [W3C WCAG 2.1](https://www.w3.org/TR/WCAG21/)
- [MDN Accessibility Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG)
- [Tailwind CSS Docs](https://tailwindcss.com/docs/utility-first)
- [web.dev: Core Web Vitals](https://web.dev/articles/vitals)

---

## 3. Testing

### Test Naming Conventions

| Convention | Description | Source |
|---|---|---|
| Describe what, not how | `"should return 404 when user not found"` not `"test getUserById"` | [Goldberg: JS Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices) |
| "when... then..." pattern | Structure names as `"when [condition], then [expected result]"` | Same source |
| Three parts in the name | (1) What is being tested, (2) under what circumstances, (3) expected result | Same source |

**Why it matters:** Good test names serve as living documentation. When a test fails, the name should tell you what broke without reading the test body.

### AAA Pattern (Arrange / Act / Assert)

| Section | Description | Source |
|---|---|---|
| Arrange | Set up test data, mocks, and preconditions | [Goldberg: AAA Pattern](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/testingandquality/aaa.md) |
| Act | Execute the unit under test (usually 1 line) | Same source |
| Assert | Verify the expected outcome (usually 1 line) | Same source |
| Visual separation | Separate the three sections with blank lines | Same source |

**Why it matters:** The AAA convention helps readers parse test intent effortlessly. It enforces focused tests that verify one behavior.

### Coverage Thresholds

| Convention | Threshold | Source |
|---|---|---|
| Reasonable minimum | 80% line coverage | Industry consensus; many CI tools default |
| Do NOT target 100% | Diminishing returns; incentivizes testing implementation details | [Kent C. Dodds: How to know what to test](https://kentcdodds.com/blog/how-to-know-what-to-test) |
| Focus on critical paths | Cover the use cases users care about, not lines of code | Same source |
| Branch coverage | >= 70% branch coverage as supplementary metric | SonarQube defaults |

**Why it matters:** Coverage is a useful negative indicator (low coverage = undertested) but a poor positive indicator (high coverage != well-tested).

### Integration vs Unit Test Ratios

| Convention | Description | Source |
|---|---|---|
| Testing Trophy (Kent C. Dodds) | "Write tests. Not too many. Mostly integration." | [Kent C. Dodds: Write Tests](https://kentcdodds.com/blog/write-tests) |
| Test Pyramid (Martin Fowler) | Many unit tests, fewer integration, fewest E2E | [Martin Fowler: Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html) |
| Practical Test Pyramid | Focus on integration tests at boundaries; unit tests for complex logic | [Martin Fowler: Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) |
| web.dev testing strategies | Multiple valid shapes; pick one that fits your team | [web.dev: Testing Strategies](https://web.dev/articles/ta-strategies) |

**Why it matters:** The right balance depends on your architecture. The key insight from both Fowler and Dodds: tests should give confidence that the software works, not just that individual functions work.

### Mocking Boundaries

| Convention | Description | Source |
|---|---|---|
| Mock at system boundaries | HTTP calls, databases, file system, third-party services | [Goldberg: Mocking](https://github.com/goldbergyoni/nodejs-testing-best-practices/blob/master/mocking.md) |
| Don't mock what you don't own (carefully) | Prefer integration tests for your own code; mock external dependencies | [Martin Fowler: Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) |
| Network mocking | Use tools like nock/msw to simulate external API responses | Industry consensus |
| Test implementation details = brittle tests | Mock interfaces, not implementations | [Kent C. Dodds: Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details) |

**Why it matters:** Over-mocking creates tests that pass even when the system is broken. Under-mocking creates tests that are slow and flaky.

### Test Isolation

| Convention | Description | Source |
|---|---|---|
| Each test owns its data | Tests should create their own test data, not depend on shared state | [Goldberg: JS Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices) |
| No test ordering dependencies | Tests must pass when run individually or in any order | Same source |
| Clean up after tests | Reset state (DB, mocks) in afterEach/afterAll | Same source |
| Keep tests small | Ideally <= 7 statements, runtime < 10 seconds | Same source |

**Why it matters:** Coupled tests create cascading failures that are expensive to debug. Isolated tests can be run in parallel.

### Key References for Domain 3

- [Goldberg: JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Kent C. Dodds: The Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Martin Fowler: Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Martin Fowler: Testing Guide](https://martinfowler.com/testing/)
- [web.dev: Testing Strategies](https://web.dev/articles/ta-strategies)

---

## 4. Git / VCS

### Commit Message Conventions (Conventional Commits)

| Convention | Description | Source |
|---|---|---|
| Format | `type(scope): description` | [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) |
| Types | `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` | Same source |
| Breaking changes | `feat!:` or `BREAKING CHANGE:` footer | Same source |
| SemVer mapping | `fix` -> PATCH, `feat` -> MINOR, `BREAKING CHANGE` -> MAJOR | Same source |
| Subject line | <= 72 characters, imperative mood, no period | Same source + Git project conventions |

**Why it matters:** Machine-readable commits enable automated changelog generation, semantic versioning, and better git archaeology.

### Branch Naming

| Convention | Description | Source |
|---|---|---|
| Prefix by type | `feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/` | [Conventional Branch](https://conventional-branch.github.io/) |
| Lowercase, hyphen-separated | `feature/add-user-auth` not `Feature/AddUserAuth` | Same source |
| Include ticket ID | `feature/PROJ-123-add-user-auth` | Industry consensus |
| Short-lived branches | Branches should be merged within days, not weeks | Google eng practices |

**Why it matters:** Consistent branch naming enables automation (CI rules per branch type) and makes the branch list scannable.

### PR Size Limits

| Convention | Threshold | Source |
|---|---|---|
| Google recommendation | < 200 lines of changed code | [Google Eng Practices: Small CLs](https://google.github.io/eng-practices/review/developer/) |
| Ideal size | 50-100 lines | [Graphite: The ideal PR is 50 lines long](https://graphite.com/blog/the-ideal-pr-is-50-lines-long) |
| Soft limit | 400 lines | [Graphite: Managing PR size](https://graphite.com/guides/best-practices-managing-pr-size) |
| Hard limit | 600 lines (must be split above this) | Industry best practice |
| Review time | Should be reviewable in < 30 minutes | Google internal practice |

**Why it matters:** Research shows review quality drops sharply above 200 lines. Time-to-review, time-to-merge, and bugs caught per line all improve with smaller PRs.

### Squash vs Merge

| Convention | When to use |
|---|---|
| Squash merge | Feature branches with messy/WIP commits; produces clean linear history |
| Merge commit | When individual commits in a branch are meaningful and well-structured |
| Rebase + merge | When you want linear history AND meaningful individual commits |
| Never force-push to main | Shared branches should never have history rewritten |

**Why it matters:** The strategy affects git bisect effectiveness, changelog generation, and the ability to revert changes cleanly.

### Key References for Domain 4

- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Google Engineering Practices: Code Review](https://google.github.io/eng-practices/review/)
- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/)
- [Conventional Branch](https://conventional-branch.github.io/)
- [Graphite: Best practices for PR size](https://graphite.com/guides/best-practices-managing-pr-size)

---

## 5. Security

### Secret Management

| Convention | Description | Source |
|---|---|---|
| Never commit secrets | Use pre-commit hooks (e.g., git-secrets, detect-secrets) | [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) |
| Use environment variables | Or a secrets manager (Vault, AWS Secrets Manager, etc.) | Same source |
| Rotate secrets regularly | Automate rotation where possible | Same source |
| .gitignore sensitive files | `.env`, credentials, private keys | Industry standard |
| Scan for leaked secrets | Use tools like truffleHog, gitleaks in CI | [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/latest/01a-Secrets-Management) |

**Why it matters:** Leaked secrets are the #1 cause of breaches in public repos. A single committed AWS key can cost thousands in minutes.

### Input Validation Boundaries

| Convention | Description | Source |
|---|---|---|
| Validate on both client AND server | Client for UX; server is the trust boundary | [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) |
| Syntactic + semantic validation | Syntactic: correct format. Semantic: correct value in context | Same source |
| Allowlist over denylist | Define what IS valid, not what isn't | Same source |
| Parameterized queries | Never interpolate user input into SQL/commands | OWASP SQL Injection Prevention |
| Validate at API boundaries | Every public endpoint validates its inputs | Same source |

**Why it matters:** Input validation is the first line of defense against injection attacks (SQLi, XSS, SSRF). Server-side validation is non-negotiable.

### Dependency Scanning

| Convention | Description | Source |
|---|---|---|
| Automated scanning in CI | Run on every PR/build | [OWASP Vulnerable Dependency Management](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html) |
| Tools | OWASP Dependency-Check, Snyk, npm audit, Dependabot | Same source |
| Pin dependency versions | Use lockfiles (package-lock.json, Gemfile.lock) | Industry standard |
| Monitor for new CVEs | Enable automated alerts for new vulnerabilities | GitHub Dependabot / Snyk |
| SBOM generation | Maintain a Software Bill of Materials | [OWASP Dependency Graph SBOM](https://cheatsheetseries.owasp.org/cheatsheets/Dependency_Graph_SBOM_Cheat_Sheet.html) |

**Why it matters:** Supply chain attacks are rising. Known vulnerabilities in dependencies are the lowest-hanging fruit for attackers.

### OWASP References

| Resource | URL |
|---|---|
| OWASP Top 10 (2021) | https://owasp.org/Top10/ |
| OWASP Cheat Sheet Series | https://cheatsheetseries.owasp.org/ |
| OWASP Secrets Management | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html |
| OWASP Input Validation | https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html |
| OWASP Dependency Management | https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html |

### Key References for Domain 5

- [OWASP Cheat Sheet Series (Index)](https://cheatsheetseries.owasp.org/IndexTopTen.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP Vulnerable Dependency Management](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html)
- [OWASP DevSecOps Guideline](https://owasp.org/www-project-devsecops-guideline/latest/01a-Secrets-Management)

---

## 6. API Design

### RESTful Conventions

| Convention | Description | Source |
|---|---|---|
| Use nouns, not verbs | `/users/123` not `/getUser?id=123` | [Microsoft REST API Guidelines](https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md) |
| HTTP methods as verbs | GET (read), POST (create), PUT (full update), PATCH (partial update), DELETE | Same source |
| Plural resource names | `/users`, `/orders` (not `/user`, `/order`) | Same source |
| Nested resources for relationships | `/users/123/orders` | Same source |
| HATEOAS (optional) | Include links to related resources in responses | REST architectural constraint |
| Idempotency | GET, PUT, DELETE must be idempotent | HTTP specification |

**Why it matters:** RESTful conventions make APIs predictable. Developers can guess endpoints without reading docs.

### Error Response Formats

| Convention | Description | Source |
|---|---|---|
| RFC 9457 (formerly 7807) | Standard "Problem Details" format for HTTP APIs | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) |
| Fields | `type`, `title`, `status`, `detail`, `instance` | Same source |
| Media type | `application/problem+json` | Same source |
| Microsoft format | `code` (machine-readable), `message` (human-readable), `innererror` (details) | [Microsoft REST API Guidelines](https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md) |
| Consistent across all endpoints | Same error shape everywhere | Both sources |

**Why it matters:** Standardized errors enable generic error handling in clients. RFC 9457 is an IETF standard that eliminates bikeshedding over error formats.

### Versioning

| Convention | Description | Source |
|---|---|---|
| URL path versioning | `/api/v1/users` (most common, most visible) | [Microsoft: API Design Best Practices](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design) |
| Header versioning | `Accept: application/vnd.myapi.v2+json` | Same source |
| Query param versioning | `/users?api-version=2024-01-01` (Azure pattern) | [Microsoft Azure REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md) |
| Avoid breaking changes | Add new fields; don't remove or rename existing ones | Microsoft REST API Guidelines |
| Sunset header | Announce deprecation timeline for old versions | Industry practice |

**Why it matters:** Versioning protects existing clients from breaking changes while allowing the API to evolve.

### Rate Limiting

| Convention | Description | Source |
|---|---|---|
| Return 429 Too Many Requests | Standard HTTP status for rate limiting | HTTP specification |
| Include rate limit headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | Industry convention |
| Rate limit failures != faults | Do not count 429s against API availability metrics | [Microsoft REST API Guidelines](https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md) |
| Retry-After header | Tell clients when they can retry | HTTP specification (RFC 7231) |
| Document limits | Publish rate limits in API docs | Industry standard |

**Why it matters:** Rate limiting protects backend services from abuse and ensures fair resource allocation across clients.

### Key References for Domain 6

- [Microsoft REST API Guidelines](https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md)
- [Microsoft: Web API Design Best Practices](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Microsoft Engineering Playbook: REST API Design](https://microsoft.github.io/code-with-engineering-playbook/design/design-patterns/rest-api-design-guidance/)
- [RESTful API Best Practices](https://restfulapi.net/rest-api-best-practices/)

---

## 7. Documentation

### When to Document vs When Code Should Be Self-Documenting

| Convention | Description | Source |
|---|---|---|
| Code should explain WHAT and HOW | Use clear naming, small functions, obvious flow | Industry consensus; *Clean Code* (Robert C. Martin) |
| Comments should explain WHY | Non-obvious decisions, business rules, workarounds | Same source |
| Document public APIs | Every public function/method/endpoint needs docs | [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html) |
| Don't document obvious code | `i++ // increment i` adds noise, not value | Same source |
| Document architectural decisions | ADRs (Architecture Decision Records) for significant choices | Michael Nygard: ADR format |
| JSDoc/TSDoc for libraries | Type signatures and examples for public interfaces | TypeScript/JSDoc conventions |

**Why it matters:** Stale documentation is worse than no documentation. Self-documenting code reduces maintenance burden; strategic comments capture context that code cannot.

### README Conventions

| Convention | Description | Source |
|---|---|---|
| Required sections | Project name, description, installation, usage, contributing, license | [Make a README](https://www.makeareadme.com/) |
| Format | Markdown (README.md) | Industry standard |
| Badges | Build status, coverage, version, license | Same source |
| Quick start | Copy-pasteable commands to get running in < 5 minutes | Same source |
| Keep it current | README is the front door; stale READMEs erode trust | Same source |

**Why it matters:** The README is often the first (and sometimes only) documentation a new contributor reads. A good README reduces onboarding time from days to minutes.

### Changelog Conventions

| Convention | Description | Source |
|---|---|---|
| Keep a Changelog format | Group by: Added, Changed, Deprecated, Removed, Fixed, Security | [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) |
| File name | `CHANGELOG.md` in project root | Same source |
| Link versions to diffs | Each version header links to the git comparison | Same source |
| Follow SemVer | Version numbers follow Semantic Versioning | Same source |
| Unreleased section | Track upcoming changes at the top | Same source |
| Human-readable | Changelogs are for humans, not machines; write for your users | Same source |

**Why it matters:** Changelogs communicate the "what changed and why" to users who don't read commits. They're essential for library consumers deciding whether to upgrade.

### Key References for Domain 7

- [Make a README](https://www.makeareadme.com/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Google Python Style Guide (docstrings section)](https://google.github.io/styleguide/pyguide.html)
- [Google Developer Documentation Style Guide](https://developers.google.com/style)
- [Common Changelog](https://common-changelog.org/)

---

## Master Reference List

### Style Guides
- [Google Style Guides (all languages)](https://google.github.io/styleguide/)
- [Google Engineering Practices](https://google.github.io/eng-practices/review/)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Airbnb CSS-in-JavaScript Style Guide](https://airbnb.io/javascript/css-in-javascript/)
- [Google Developer Documentation Style Guide](https://developers.google.com/style)

### Testing
- [Martin Fowler: Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Martin Fowler: Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html)
- [Martin Fowler: Testing Guide](https://martinfowler.com/testing/)
- [Kent C. Dodds: Write Tests](https://kentcdodds.com/blog/write-tests)
- [Kent C. Dodds: Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Kent C. Dodds: Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
- [Goldberg: JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Goldberg: Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

### Accessibility & Performance
- [W3C WCAG 2.1](https://www.w3.org/TR/WCAG21/)
- [WCAG 2 Overview (W3C WAI)](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [MDN: Understanding WCAG](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG)
- [web.dev: Web Vitals](https://web.dev/articles/vitals)
- [web.dev: Core Web Vitals](https://web.dev/explore/learn-core-web-vitals)
- [web.dev: Performance](https://web.dev/performance)

### Security
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP Vulnerable Dependency Management](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html)

### API Design
- [Microsoft REST API Guidelines](https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md)
- [Microsoft: Web API Design Best Practices](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)

### Git & VCS
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Conventional Branch](https://conventional-branch.github.io/)

### Documentation
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Make a README](https://www.makeareadme.com/)
- [Common Changelog](https://common-changelog.org/)

### Linting & Static Analysis
- [ESLint Rules](https://eslint.org/docs/latest/rules/)
- [ESLint max-lines](https://eslint.org/docs/latest/rules/max-lines)
- [ESLint max-lines-per-function](https://eslint.org/docs/latest/rules/max-lines-per-function)
