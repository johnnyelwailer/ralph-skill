# Project TODO

## Current Phase: Spec parity hardening (dashboard/runtime contract)

### In Progress
- [x] [review] Gate 2: Make `<skill>/cli/src/commands/dashboard.test.ts` oversized-body test deterministic (no `fetch failed` fallback) so it only passes on explicit `400` + `"Request body too large"` API behavior; this prevents transport-level false positives. (P0)
- [x] [review] Gate 3: Raise branch coverage for touched implementation modules to >=80% (>=90% for new modules); current summary still reports low branch coverage (`project.ts` 63.73%), so missing branches must be covered with focused tests. (P0)

### Up Next
- [x] Update prerequisites to Node.js 22 LTS guidance in `README.md` (version-manager-first: `nvm-windows`/`fnm` on Windows, `nvm`/`fnm` on macOS/Linux, with `nvm install --lts && nvm use --lts`) to match the spec baseline. (P0)
- [ ] Add `engines.node` for Node 22 LTS in applicable `package.json` files (`<skill>/cli/package.json`, `<skill>/cli/dashboard/package.json`) to enforce runtime/tooling compatibility. (P0)
- [ ] Serve dashboard root as a self-contained HTML payload from `dashboard.ts` (inline JS/CSS) while preserving `/api/*` and `/events`; current server still serves asset files from `dist/dashboard`. (P1)
- [ ] Close remaining dashboard E2E contract gaps in Playwright: add stop-confirm interaction and verify log-view autoscroll behavior. (P1)
- [ ] Harden Docs markdown rendering against unsafe HTML in `dashboard/src/App.tsx` and add regression tests for markdown safety; keep `{{REFERENCE_FILES}}` scaffold substitution coverage intact. (P1)
- [ ] Add `playwright-report/` and `test-results/` to root `.gitignore` to satisfy Playwright artifact ignore requirements. (P2)
- [ ] Migrate dashboard workspace from Tailwind CSS 3 (`tailwindcss@^3.4.14`) to Tailwind CSS 4 while preserving existing shadcn component behavior. (P2)

### Completed
- [x] Remove unused dashboard dependency `"aloop-cli": "file:.."` from `<skill>/cli/dashboard/package.json` and kept build/tests green.
- [x] [review] Expanded branch-coverage evidence beyond `project.ts` with focused tests for installer stale cleanup, CLI auto-install branches, VS Code prompt skip/install branches, and dashboard error paths.
- [x] Fixed runtime install path mismatch so installer output includes `~/.aloop/cli/dist/index.js` for loop launcher compatibility.
- [x] Added Playwright E2E foundation in `<skill>/cli/dashboard/` (`@playwright/test`, config, `test:e2e`, and `webServer` startup against real dashboard server).
- [x] Added fixture-backed Playwright coverage for initial render, session list/status, progress view, docs rendering, log view, steering write, stop flow, navigation switching, and SSE reconnect/state refresh.
- [x] Implemented markdown docs rendering in dashboard via `marked` instead of raw text-only output.
- [x] Aligned README and command/prompt docs with canonical harness install paths and command/prompt naming.
- [x] Added discovery/scaffold parity for `reference_candidates`, persisted `reference_files`, and `{{REFERENCE_FILES}}` prompt substitution.
- [x] Implemented CLI commands (`resolve`, `discover`, `scaffold`, `dashboard`) with runtime build output at `<skill>/cli/dist/index.js`.
- [x] Implemented dashboard APIs for steering (`/api/steer`) and stop control (`/api/stop`) with runtime loop integration and auto-launch URL output.
