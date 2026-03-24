# TODO

## Review Findings

- [ ] [review] Gate 1/Gate 2: `index.ts:192` — `help` command is not hidden; default `aloop --help` shows 7 commands (setup, start, dashboard, status, stop, steer, **help**) instead of the spec-required 6. TASK_SPEC AC explicitly lists only: setup, start, status, steer, stop, dashboard. Fix: add `{ hidden: true }` to the `help` command registration at `index.ts:192`. Also fix `index.test.ts:39-57` to add `assert.doesNotMatch(result.stdout, /^\s+help\b/m)` so the test would catch this regression — the test title claims "only 6" but the assertion doesn't enforce it. (priority: high)

## QA Bugs

- [ ] [qa/P2] `engine` field missing from orchestrator meta.json: ran `aloop start --mode orchestrate` → meta.json written without `engine` field → spec (TASK_SPEC.md §Resume) says to add `engine?: 'loop' | 'orchestrate'` and write it when creating an orchestrator session via `aloop start`. Resume currently works via `mode: orchestrate` fallback but `engine` field is required by spec. Tested at iter 12.
