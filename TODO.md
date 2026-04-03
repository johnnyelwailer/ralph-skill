# Issue #172: Replace mkdir locking with POSIX flock in loop.sh health file access

## Tasks

- [x] Implement as described in the issue
- [x] [review] Gate 9: SPEC.md line 160 says "`.flock` sidecar file (FD 9)" but implementation uses `.lock` extension (`lock_file="${path}.lock"`) and dynamic FD allocation (`exec {fd}>`), not hardcoded FD 9 — update SPEC.md to accurately describe what was implemented (priority: low)

spec-gap analysis (2026-03-31): 2 gaps found

- [x] [spec-gap] P2: Agent templates in `aloop/agents/opencode/` use `provider: openrouter` which is not a valid provider. Valid providers are: `claude`, `codex`, `gemini`, `copilot`, `opencode`. SPEC.md line 42 lists the 5 valid CLI providers; `ProviderName` union in `aloop/cli/src/commands/start.ts:11` confirms `openrouter` is absent. Fix: change `provider: openrouter` → `provider: opencode` in `aloop/agents/opencode/code-critic.md:5`, `aloop/agents/opencode/error-analyst.md:5`, `aloop/agents/opencode/vision-reviewer.md:5`. (Note: `openrouter/` is a *model* prefix used with opencode, not a standalone provider.)
- [x] [spec-gap] P2: `aloop/bin/loop.sh:33` defaults Claude model to `sonnet` (`ALOOP_CLAUDE_MODEL:-sonnet`) but `aloop/config.yml:21` specifies `claude: opus`. `loop.ps1:34` is correct (`'opus'`). Fix: change line 33 of loop.sh from `sonnet` to `opus` to match config.yml and loop.ps1.

spec-review (2026-03-31): all flock locking requirements confirmed implemented — writes use flock -x, reads use flock -s, 5-attempt backoff (50–250ms), stale-dir cleanup, health_lock_failed logged on failure, all-providers-cooldown sleep — APPROVED

[reviewed: gates 1-9 pass — 2026-03-31]
[final-review: gates 1-10 pass — 2026-03-31]
[final-review: gates 1-10 pass (spec-review triggered) — 2026-03-31]
[final-review: gates 1-10 pass (final qa re-run) — 2026-03-31]
[final-review: gates 1-10 pass (spec-review triggered, README flock/concurrent_cap docs) — 2026-03-31]

spec-review (2026-03-31, re-run): all flock locking requirements re-verified against SPEC.md lines 157–175 — flock -x writes, flock -s reads, 5-attempt backoff (50–250ms), flock -n non-blocking, dynamic FD, .lock sidecar, stale-dir cleanup, health_lock_failed logged, all-providers-cooldown sleep — APPROVED, no gaps found

[final-review: gates 1-10 pass (spec-review re-run + flock/util-linux prereq docs) — 2026-03-31]

spec-review (2026-03-31, triggered by docs): re-verified after README steer/devcontainer docs fix — no locking logic changed, all flock requirements still pass — APPROVED

[final-review: gates 1-10 pass (spec-review triggered, README steer/devcontainer docs) — 2026-03-31]
