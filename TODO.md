# Issue #200: CI: Add agent/* branch triggers and workflow polish

## Tasks

### In Progress

- [ ] [review] Gate 5: `cli-tests` job will fail in CI — `npm run build` in `aloop/cli` calls `build:dashboard` which invokes `npm --prefix dashboard run build` (vite), but the job only installs `aloop/cli` deps and never installs `aloop/cli/dashboard` deps. Fix: either install dashboard deps before `npm run build`, or split the build step to only run `build:server` + `build:shebang` + `build:templates` + `build:bin` + `build:agents` (skipping `build:dashboard`) in the `cli-tests` job (priority: high)
- [ ] [review] Gate 1: `dashboard-e2e` job was added but is NOT in the TASK_SPEC deliverables or acceptance criteria. TASK_SPEC explicitly specifies exactly four jobs. Adding a fifth (`dashboard-e2e` with Playwright caching) violates Constitution #19 (no gold-plating). Fix: remove the `dashboard-e2e` job from `.github/workflows/ci.yml` (priority: high)
- [ ] [review] Gate 1: Extra steps added to `loop-script-tests` ("Run shell script tests" and "Run PowerShell script tests") are outside the scope of issue #200. This issue's deliverables only require the four jobs to exist — modifying `loop-script-tests` content is out of scope (Constitution #12, #19). Fix: revert the extra steps in `loop-script-tests` to only `bats loop.bats` as the previous issue #199 left it, or confirm those steps were correct for issue #199 and that this PR is not responsible for them (priority: medium)

### Completed
- [x] Add `agent/*` and `aloop/*` to `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml`
- [x] Ensure all four required jobs (`cli-tests`, `dashboard-tests`, `type-check`, `loop-script-tests`) are present and independent (no `needs`)
- [x] Verify README CI badge targets `https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg`
- [x] Workflow `name: CI` is stable for badge compatibility
