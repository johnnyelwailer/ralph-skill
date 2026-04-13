## Summary

Adds `agent/*` and `aloop/*` branch triggers to CI workflow so that agent/aloop branches automatically run CI on push and pull_request. Polishes the four required jobs to ensure correct structure with no inter-job dependencies.

## Files Changed

- `.github/workflows/ci.yml` — added branch triggers, fixed four-job structure, removed out-of-scope additions

## Verification

- [x] `on.push.branches` includes `master`, `agent/*`, `aloop/*` — verified at ci.yml:5
- [x] `on.pull_request.branches` includes `master`, `agent/*`, `aloop/*` — verified at ci.yml:7
- [x] All four required jobs exist: `type-check` (line 14), `cli-tests` (line 45), `dashboard-tests` (line 70), `loop-script-tests` (line 91)
- [x] No `needs:` declarations on any job — all four run in parallel
- [x] `name: CI` is stable (line 1)
- [x] README badge targets `actions/workflows/ci.yml/badge.svg` — verified at README.md:1

## Proof Artifacts

Pure CI configuration change — no observable runtime output to capture. All acceptance criteria verified by static inspection.
