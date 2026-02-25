# Project TODO

## Current Phase: Spec parity hardening

### In Progress
- [ ] None.

### Up Next
- [ ] Remove unused dashboard dependency `"aloop-cli": "file:.."` from `<skill>/cli/dashboard/package.json` and keep build/tests green. (P0)
- [ ] Update prerequisite docs to Node.js 22.x (latest LTS) and add version-manager-first guidance (`nvm-windows`/`fnm` on Windows; `nvm`/`fnm` on macOS/Linux) including `nvm install --lts && nvm use --lts`. (P0)
- [ ] Add `engines.node` constraints targeting Node.js 22 LTS in applicable repository `package.json` files and validate scripts still run. (P0)
- [ ] Serve dashboard as a self-contained HTML response (inlined JS/CSS) from `dashboard.ts` while preserving current `/api/*` and `/events` behavior. (P1)
- [ ] Close remaining Dashboard E2E contract gaps: add stop-confirm interaction and log autoscroll assertions to Playwright suite. (P1)
- [ ] Harden docs markdown rendering against unsafe HTML and add regression tests for markdown safety plus `{{REFERENCE_FILES}}` scaffold substitution behavior. (P1)
- [ ] Add `playwright-report/` and `test-results/` to repo `.gitignore` per Playwright artifact contract. (P2)
- [ ] Migrate dashboard workspace from Tailwind CSS 3 to Tailwind CSS 4 while preserving existing shadcn component behavior. (P2)

### Completed
- [x] [review] Expanded branch-coverage evidence beyond `project.ts` with focused tests for installer stale cleanup, CLI auto-install branches, VS Code prompt skip/install branches, and dashboard error paths.
- [x] Fixed runtime install path mismatch so installer output includes `~/.aloop/cli/dist/index.js` for loop launcher compatibility.
- [x] Added Playwright E2E foundation in `<skill>/cli/dashboard/` (`@playwright/test`, config, `test:e2e`, and `webServer` startup against real dashboard server).
- [x] Added fixture-backed Playwright coverage for initial render, session list/status, progress view, docs rendering, log view, steering write, stop flow, navigation switching, and SSE reconnect/state refresh.
- [x] Implemented markdown docs rendering in dashboard via `marked` instead of raw text-only output.
- [x] Aligned README and command/prompt docs with canonical harness install paths and command/prompt naming.
- [x] Added discovery/scaffold parity for `reference_candidates`, persisted `reference_files`, and `{{REFERENCE_FILES}}` prompt substitution.
- [x] Implemented CLI commands (`resolve`, `discover`, `scaffold`, `dashboard`) with runtime build output at `<skill>/cli/dist/index.js`.
- [x] Implemented dashboard APIs for steering (`/api/steer`) and stop control (`/api/stop`) with runtime loop integration and auto-launch URL output.
