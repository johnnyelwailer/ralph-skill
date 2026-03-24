# TODO

## QA Bugs

- [ ] [qa/P2] `engine` field missing from orchestrator meta.json: ran `aloop start --mode orchestrate` → meta.json written without `engine` field → spec (TASK_SPEC.md §Resume) says to add `engine?: 'loop' | 'orchestrate'` and write it when creating an orchestrator session via `aloop start`. Resume currently works via `mode: orchestrate` fallback but `engine` field is required by spec. Tested at iter 12.
