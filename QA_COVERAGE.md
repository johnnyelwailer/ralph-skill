# QA Coverage — Issue #104: QA coverage enforcement in finalizer and loop script phase support

| Feature | Component | Last Tested | Commit | Status | Criteria Met | Notes |
|---------|-----------|-------------|--------|--------|--------------|-------|
| QA coverage parsing (loop.sh) | bin/loop.sh | 2026-03-22 | 8ef27976 | PASS | 3/3 | Behavioral tests pass: gate passes at ≤30% untested, blocks when >30% untested, blocks when FAIL rows exist |
| QA coverage gate in finalizer (loop.sh) | bin/loop.sh | 2026-03-22 | 8ef27976 | FAIL | 1/2 | Gate logic correct (tests pass) but gate never fires in live loop — finalizer array always empty in loop-plan.json because pipeline.yml not compiled |
| QA coverage parsing (loop.ps1) | bin/loop.ps1 | 2026-03-22 | 8ef27976 | FAIL | 0/3 | Pester tests timeout/fail — first test fails: tasks_marked_complete event not found |
| QA coverage gate in finalizer (loop.ps1) | bin/loop.ps1 | 2026-03-22 | 8ef27976 | FAIL | 0/2 | Same blocker as loop.sh — finalizer array empty, gate never fires |
| iteration_mode spec-gap/docs (loop.sh) | bin/loop.sh | 2026-03-22 | 8ef27976 | FAIL | 1/2 | Code accepts spec-gap/docs modes (retry tracking fix verified) but cannot trigger end-to-end — blocked by empty finalizer |
| iteration_mode spec-gap/docs (loop.ps1) | bin/loop.ps1 | 2026-03-22 | 8ef27976 | FAIL | 1/2 | Same blocker — code fix verified but cannot trigger end-to-end |
| Finalizer prompt compilation | CLI/start.ts | 2026-03-22 | 8ef27976 | PASS | 2/3 | Prompts copied to session dir (fix verified). But loop-plan.json finalizer array still empty — pipeline.yml not compiled into it |
| Finalizer prompt templates | templates/ | 2026-03-22 | 8ef27976 | PASS | 3/3 | All 6 templates exist with correct frontmatter and trigger chain |
| QA coverage gate missing file | bin/loop.sh | 2026-03-22 | 8ef27976 | PASS | 1/1 | Gate returns success when QA_COVERAGE.md missing — fix at 87bca89c verified via behavioral test |
| Scaffold pipeline.yml | CLI/project.mjs | 2026-03-22 | 8ef27976 | FAIL | 0/1 | scaffold does not create pipeline.yml — confirmed still broken |
