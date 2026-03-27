# Security Conventions

> This file is seeded by `aloop setup` and should be customized for your project.
> Agents read this file to enforce secure-by-default practices.

## Secrets

- **Never commit secrets.** No API keys, tokens, passwords, or private keys in code or config files.
- **Use environment variables** or a secrets manager (Vault, AWS SM, GCP SM).
- **`.gitignore` must include:** `.env*`, `*.pem`, `*.key`, `credentials.*`, `secrets.*`
- **Pre-commit scanning:** Use git-secrets, detect-secrets, or gitleaks in CI.
- **If a secret is committed:** rotate it immediately. Removing from git history is not enough.

Why: A single committed AWS key has caused six-figure cloud bills within hours. ([OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html))

## Input Validation

- **Validate at every system boundary:** API endpoints, CLI args, file uploads, webhook payloads.
- **Server-side validation is mandatory.** Client-side is for UX only.
- **Allowlist over denylist.** Define what IS valid, not what isn't.
- **Parameterize all queries.** Never interpolate user input into SQL, shell commands, or templates.
- **Sanitize output.** Escape HTML (DOMPurify), encode URLs, sanitize markdown.

Why: Input validation is the first defense against injection attacks (SQLi, XSS, SSRF, command injection). ([OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html))

## Dependencies

- **Lock dependency versions.** Always commit lockfiles (`package-lock.json`, `Gemfile.lock`, etc.).
- **Run `npm audit` / `pip audit` / equivalent in CI.** Fail the build on critical/high CVEs.
- **Enable Dependabot / Renovate** for automated dependency updates.
- **Minimize dependencies.** Every dependency is an attack surface. Evaluate before adding.

Why: Supply chain attacks are the fastest-growing attack vector. ([OWASP Dependency Management](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html))

## Authentication & Authorization

- **Use established libraries.** Don't roll your own auth, crypto, or session management.
- **Principle of least privilege.** Grant minimum necessary permissions.
- **Fail closed.** If auth check fails or is ambiguous, deny access.

## Quick Checklist

- [ ] No secrets in code or config
- [ ] `.gitignore` covers sensitive files
- [ ] All API inputs validated server-side
- [ ] SQL/commands use parameterized queries
- [ ] Dependencies locked and scanned
- [ ] Auth uses established library

References:
- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
