# QA Coverage

| Feature | Last Tested | Commit | Result | Notes |
|---------|-------------|--------|--------|-------|
| aloop --version | 2026-03-22 | 76a2f100 | PASS | Reports 1.0.0, exit 0 |
| aloop --help | 2026-03-22 | 76a2f100 | PASS | All README-documented commands present |
| aloop orchestrate --help | 2026-03-22 | 76a2f100 | PASS | All flags documented: --spec, --concurrency, --budget, --plan-only, --issues |
| aloop orchestrate error paths | 2026-03-22 | 76a2f100 | PASS | Nonexistent spec, invalid concurrency, negative budget, empty spec — all exit 1 with clear messages |
| aloop status | 2026-03-22 | 76a2f100 | PASS | Lists active sessions with pid, iteration, phase, relative time |
| aloop status --output json | 2026-03-22 | 76a2f100 | PASS | Valid JSON with session details |
| aloop start (scaffold + launch) | 2026-03-22 | 76a2f100 | PASS | Scaffold creates config/prompts, start launches session with dashboard URL |
| aloop stop | 2026-03-22 | 76a2f100 | PASS | Stops session cleanly, exit 0 |
| aloop dashboard --help | 2026-03-22 | 76a2f100 | PASS | Shows --port, --session-dir, --workdir, --assets-dir options |
| aloop gh --help | 2026-03-22 | 76a2f100 | PASS | All subcommands listed including pr-comments, issue-comments |
| aloop steer --help | 2026-03-22 | 76a2f100 | PASS | Shows --session, --affects-completed-work, --overwrite options |
| aloop steer error path | 2026-03-22 | 76a2f100 | PASS | Nonexistent session returns exit 1 with clear message |
