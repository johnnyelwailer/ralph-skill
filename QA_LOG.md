# QA Log

## QA Session — 2026-03-21 (Issue #181: Self-healing)

### Test Environment
- Binary under test: `/tmp/aloop-test-install-2jLpdE/bin/aloop`
- Version: 1.0.0
- Commit: 4519f75
- Features tested: 5 (label self-healing, config derivation from git remote, config derivation from env var, startup health check, graceful degradation)

### Results
- PASS: Config derivation from git remote, Graceful degradation (no crash on missing config)
- PARTIAL: Label self-healing (code runs but blocked by PATH hardening in test env), Trunk branch derivation (gh fallback only)
- FAIL: Config derivation from GITHUB_REPOSITORY env var, session-health.json completeness, ALERT.md generation

### Bugs Filed
- [qa/P1] GITHUB_REPOSITORY env var not used as filter_repo fallback
- [qa/P1] session-health.json missing gh auth, repo access, and git status checks
- [qa/P1] No ALERT.md written when critical startup checks fail

### Command Transcript

#### Test 1: Label Self-healing
```
$ aloop orchestrate --spec SPEC.md --repo johnnyelwailer/ralph-skill --plan-only --max-iterations 1
[orchestrate] trunk_branch derive via gh repo view --json defaultBranchRef --repo johnnyelwailer/ralph-skill failed: gh: blocked by aloop PATH hardening
[orchestrate] Failed to list labels: gh: blocked by aloop PATH hardening
Orchestrator session initialized.
  Session dir:  /home/pj/.aloop/sessions/orchestrator-20260321-191549
  Repo:         johnnyelwailer/ralph-skill
EXIT CODE: 0
```
session-health.json written with labels section (all 7 labels in "failed" array). No "created" or "already_existed" entries.

#### Test 2: Config Derivation from Git Remote
```
$ cd /tmp/qa-test-config-*  # git remote set to github.com/johnnyelwailer/ralph-skill
$ aloop orchestrate --spec SPEC.md --plan-only --max-iterations 1
[orchestrate] filter_repo derive via gh repo view --json nameWithOwner failed: gh: blocked by aloop PATH hardening
[orchestrate] Derived filter_repo from git remote origin: johnnyelwailer/ralph-skill
  Repo:         johnnyelwailer/ralph-skill
EXIT CODE: 0
```
PASS — filter_repo correctly derived from git remote origin URL.

#### Test 3: Config Derivation from GITHUB_REPOSITORY Env Var
```
$ cd /tmp/qa-test-env-*  # no git remote
$ GITHUB_REPOSITORY="johnnyelwailer/ralph-skill" aloop orchestrate --spec SPEC.md --plan-only --max-iterations 1
[orchestrate] filter_repo derive via gh repo view --json nameWithOwner failed: gh: blocked by aloop PATH hardening
  (no Repo: line in output)
EXIT CODE: 0
```
orchestrator.json shows filter_repo: null. FAIL — env var not used as fallback.

#### Test 4: Startup Health Check Completeness
All session-health.json files examined contain ONLY:
```json
{
  "labels": { "created": [], "already_existed": [], "failed": [...] },
  "checked_at": "..."
}
```
Missing per spec: gh_auth check, gh_repo_access check, git_status check.

#### Test 5: Graceful Degradation (No Config)
```
$ cd /tmp/qa-test-noconfig-*  # no remote, no env, no meta.json
$ aloop orchestrate --spec SPEC.md --plan-only --max-iterations 1
EXIT CODE: 0
```
PASS — orchestrator initializes without crashing. But no ALERT.md written despite all gh calls failing.

### Cleanup
- All temp directories removed
- All test sessions removed
- Test install prefix removed
