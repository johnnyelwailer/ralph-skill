# Issue #108: `aloop gh start` and `aloop gh stop` — issue-to-loop workflow

## Tasks

### Completed
- [x] Fix `extractRepoFromIssueUrl()` to support GitHub Enterprise URLs
- [x] `aloop gh start --issue <N>` fetches issue, creates branch, runs loop
- [x] PR created on completion with `Closes #N` reference
- [x] `aloop gh stop --issue <N>` stops the linked session
- [x] `aloop gh stop --all` stops all tracked GH-linked loops
- [x] Issue→session→PR mapping persisted via `watch.json`

## Spec-Gap Analysis

spec-gap analysis: no discrepancies found — spec fully fulfilled
