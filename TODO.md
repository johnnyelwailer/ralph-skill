# Issue #68: PROMPT_merge.md template and merge agent configuration

## Tasks

- [x] Implement as described in the issue
  - [x] Verified `PROMPT_merge.md` exists in `aloop/templates/`
  - [x] Added `PROMPT_merge.md` to `LOOP_PROMPT_TEMPLATES` in `aloop/cli/lib/project.mjs`
  - [x] Implemented pre-iteration branch sync and merge conflict queuing in `aloop/bin/loop.sh`
  - [x] Implemented pre-iteration branch sync and merge conflict queuing in `aloop/bin/loop.ps1`
  - [x] Verified `loop.sh` changes with `loop_branch_coverage.tests.sh`
