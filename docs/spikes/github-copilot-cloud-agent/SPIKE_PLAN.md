# GitHub Copilot Cloud Agent Spike

Created: 2026-05-02

## Goal

Determine whether GitHub Copilot cloud agent can serve as a managed "runner + agent in one" backend for aloop, for GitHub-hosted repositories, without provisioning a custom Azure/VPS sandbox.

This is not a general sandbox backend. Copilot cloud agent owns the execution environment, agent runtime, branch, commits, and pull request lifecycle. aloop would dispatch work to it, watch the GitHub-side task, and ingest the resulting PR/diff/checks as artifacts.

The spike also tests whether aloop's execution primitives are generic and pluggable enough to support a backend that does not expose a raw shell/container at all. A successful spike should prove that the scheduler, tracker, artifact, event, and cost primitives can model both:

- sandbox backends, where aloop owns the runner and launches provider turns
- managed agent backends, where an external service owns the runner and the agent, and aloop coordinates task dispatch/result ingestion

## Context

GitHub Copilot cloud agent can work independently in a GitHub Actions-powered ephemeral development environment. It can inspect a repository, create a branch, edit files, run tests, push commits, and create/update a pull request.

Current public entry points:

- `gh agent-task create "prompt" --repo <owner/repo> --base <branch> --follow`
- GitHub API issue assignment to Copilot with optional assignment inputs
- GitHub MCP tool `create_pull_request_with_copilot`
- GitHub UI, IDEs, mobile, Slack/Teams/Linear/Jira integrations

The GitHub Copilot SDK is related, but it exposes the Copilot CLI agent runtime via JSON-RPC. For this spike, prefer the cloud-agent-specific entry points above. The SDK may become useful later for a local/headless Copilot CLI provider backend, but it is not the shortest path to proving cloud-agent delegation.

## Product Classification

Treat this as a managed agent backend, not a `SandboxAdapter`.

| Existing aloop concept | Copilot cloud agent mapping |
|---|---|
| Lease sandbox | Create Copilot cloud agent session/task |
| Hydrate worktree | GitHub repository + selected base branch |
| Execute turn | Prompt Copilot via `gh agent-task create` or issue assignment |
| Stream events | `gh --follow`, session logs if available, issue/PR timeline events |
| Collect artifacts | PR URL, branch, commits, diff, check runs, comments, review request |
| Cancel/cleanup | Verify available controls; likely close PR/session or stop task if exposed |
| Cost estimate | GitHub Actions minutes + Copilot premium request / AI Credits |

Recommended future interface name: `ManagedAgentBackend`.

```ts
export type ManagedAgentBackend = {
  startTask(input: {
    repo: string;
    baseRef: string;
    prompt: string;
    issueNumber?: number;
    customInstructions?: string;
    customAgent?: string;
    model?: string;
  }): Promise<{
    taskId: string;
    prUrl?: string;
    branch?: string;
  }>;

  watchTask(input: {
    taskId: string;
  }): AsyncIterable<{
    type: "log" | "status" | "pr" | "commit" | "check" | "error";
    at: string;
    data: unknown;
  }>;

  collectResult(input: {
    taskId: string;
  }): Promise<{
    status: "succeeded" | "failed" | "needs_review" | "unknown";
    prUrl?: string;
    branch?: string;
    commits?: string[];
    diff?: string;
    checks?: unknown[];
    logs?: string;
  }>;
};
```

This spike should explicitly identify which existing primitives survive unchanged, which need small type extensions, and which would be a mistake to force through `SandboxAdapter`.

Expected pressure points:

- **Execution target typing:** scheduler permits probably need `kind: "managed-agent"` alongside `kind: "sandbox"` rather than treating Copilot as a fake provider CLI.
- **Turn lifecycle:** aloop cannot observe every tool call or token chunk; lifecycle events may be PR/check/log based.
- **Artifact model:** PRs, commits, branches, check runs, and review requests become first-class artifacts.
- **Cost model:** cost is Actions minutes plus Copilot requests/credits, not vCPU seconds or model-token usage from a provider adapter.
- **Cancellation semantics:** managed agents may expose weaker cancellation than sandboxes.
- **Policy gates:** eligibility depends on repository host, Copilot org policy, Actions policy, branch protection, and budget.

## Scope

### In Scope

1. Verify that aloop can start a Copilot cloud agent task from a script.
2. Verify both command paths:
   - `gh agent-task create`
   - GitHub API issue assignment to Copilot
3. Capture enough identifiers to poll/watch the task.
4. Ingest PR URL, branch name, commits, diff, check status, and relevant logs/comments.
5. Document auth requirements, plan requirements, and repository/org policy requirements.
6. Measure runtime, GitHub Actions minutes, and Copilot premium request / AI Credit usage.
7. Verify whether custom setup steps can install or prepare project dependencies.
8. Verify whether a custom agent or custom instructions can steer behavior enough for aloop.
9. Identify cancellation/cleanup controls.
10. Validate whether aloop's primitives can support this backend without special-case orchestration logic.

### Out of Scope

- Replacing `SandboxAdapter`.
- Non-GitHub repositories.
- Arbitrary command execution without a PR/code-change task.
- Multi-repo edits in one task.
- Full dashboard integration.
- Full scheduler integration.
- Depending on Copilot SDK unless the cloud-agent APIs are insufficient.
- Collapsing managed agents and sandboxes into one leaky abstraction.

## Requirements

### Account / Plan

- GitHub repository hosted on GitHub.
- GitHub Copilot Pro, Pro+, Business, or Enterprise.
- Copilot cloud agent enabled for the repository and organization.
- GitHub Actions enabled and not blocked by repo/org policy.
- For Business/Enterprise, admin policy must allow cloud agent and runner type.

### Local Tooling

- GitHub CLI `v2.80.0+` for `gh agent-task create`.
- Authenticated `gh` account with write access to the target repository.
- Optional: `jq` for parsing CLI/API responses.

### API Auth

For GitHub API issue assignment, verify token support during the spike. GitHub docs describe using a user token, such as:

- fine-grained PAT with read metadata and read/write actions, contents, issues, and pull requests
- classic PAT with `repo` scope
- GitHub App user-to-server token

The spike must record which token types actually work for:

- finding the Copilot suggested actor
- assigning Copilot to an issue
- passing target repository/base branch/custom instructions/model
- observing PR/session state

### Repository Setup

Optional but recommended:

- `.github/copilot-instructions.md` for repository-wide guidance.
- `.github/workflows/copilot-setup-steps.yml` to prepare the environment.
- A tiny test issue that asks for a deterministic low-risk doc/code change.
- Branch protection configured so Copilot can open PRs but cannot merge.

Example setup workflow to test:

```yaml
name: Copilot Setup Steps

on:
  workflow_dispatch:

jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun test --help
```

## Spike Phases

### Phase 1: Capability Preflight

Deliverable: a script that checks whether this repository can use Copilot cloud agent.

Checks:

1. `gh --version` is at least `2.80.0`.
2. `gh auth status` succeeds.
3. Current user has write access to the target repo.
4. Copilot cloud agent is enabled for the repo.
5. GitHub Actions is enabled.
6. `gh agent-task create --help` exists.
7. API query can find `copilot-swe-agent` in suggested actors.

Exit criteria:

- Preflight script exits 0 and prints a clear capability summary.

### Phase 2: CLI Task Creation

Deliverable: a working `gh agent-task create` invocation.

Test task:

```bash
gh agent-task create \
  "Create a draft pull request that adds a one-line note to docs/spikes/github-copilot-cloud-agent/SMOKE_TEST.md saying this file was created by the Copilot cloud agent spike. Do not modify any other files." \
  --repo <owner/repo> \
  --base <branch> \
  --follow
```

Record:

- command output
- task/session identifier, if exposed
- PR URL
- branch name
- elapsed time
- whether `--follow` includes enough logs for aloop events

Exit criteria:

- Copilot creates a branch and PR.
- The PR contains only the intended change.
- The PR is not merged automatically.

### Phase 3: API Issue Assignment

Deliverable: a script that creates or reuses an issue and assigns it to Copilot via API.

GraphQL path to verify:

1. Query repository ID.
2. Query suggested actors and find `copilot-swe-agent`.
3. Create issue or update existing issue.
4. Assign Copilot with optional agent assignment input:
   - target repository
   - base branch
   - custom instructions
   - custom agent, if available
   - model, if available

Important API detail:

- GraphQL requests must include the feature headers documented by GitHub for Copilot assignment support and model selection.

Exit criteria:

- Script can start a Copilot task without interactive UI.
- Script records stable identifiers needed for polling/ingestion.

### Phase 4: Result Ingestion

Deliverable: a polling script that maps GitHub state to aloop-ish events and artifacts.

Collect:

- issue timeline assignment event
- PR URL
- PR head branch
- commits
- diff/stat
- PR body
- Copilot comments/log links
- check runs and conclusions
- review request state

Prototype event mapping:

```json
{ "type": "managed_agent.task.started", "backend": "github-copilot-cloud", "task_id": "..." }
{ "type": "managed_agent.log", "task_id": "...", "message": "..." }
{ "type": "managed_agent.pr.created", "task_id": "...", "pr_url": "..." }
{ "type": "managed_agent.commit.pushed", "task_id": "...", "sha": "..." }
{ "type": "managed_agent.check.completed", "task_id": "...", "name": "...", "conclusion": "success" }
{ "type": "managed_agent.task.needs_review", "task_id": "...", "pr_url": "..." }
```

Exit criteria:

- The polling script can reconstruct task outcome without scraping GitHub HTML.
- All required artifacts are available through CLI/API calls.

### Phase 5: Environment Customization

Deliverable: a verified `copilot-setup-steps.yml` path.

Tests:

1. Setup steps run before Copilot starts.
2. Setup logs are visible enough to debug failures.
3. Dependency install/cache behavior is acceptable.
4. Failing setup steps do not hide the final task result.
5. `runs-on` can be changed to larger or self-hosted runners where allowed.

Exit criteria:

- We know how to prepare a project so Copilot can run the repo's normal validation commands.

### Phase 6: Security and Policy

Deliverable: security notes for safe aloop integration.

Verify:

- Copilot can only work in the selected repository.
- Copilot opens a PR but cannot merge.
- Branch protection/rulesets do not block Copilot from creating/updating a PR.
- Content exclusions do not protect files from Copilot cloud agent; document this as a risk.
- Firewall defaults and custom allowlists are visible and configurable.
- No aloop daemon/admin credentials are exposed to Copilot.
- If self-hosted runners are used, they are ephemeral single-use runners.

Exit criteria:

- We can state exactly what trust boundary GitHub owns and what aloop still controls.

### Phase 7: Cost Measurement

Deliverable: cost note with measured values for at least 3 tasks.

Record:

- elapsed wall time
- GitHub Actions minutes consumed
- premium request / AI Credit consumption
- model used, if visible
- whether usage appears under Copilot cloud agent SKU
- effect of included allowances versus paid overage

Important date note:

- As of 2026-05-02, GitHub docs say each Copilot cloud agent session consumes one premium request plus GitHub Actions minutes.
- GitHub's billing model is changing on 2026-06-01 toward AI Credit/token-based billing. Re-verify pricing before committing production cost assumptions.

Exit criteria:

- We can compare Copilot cloud agent cost against Azure dynamic sessions and DIY workers for equivalent tasks.

## Integration Design

### Primitive Fit Test

The spike must produce a short fit report for these primitives:

| Primitive | Question to answer | Expected result |
|---|---|---|
| Scheduler permit | Can dispatch be represented as capacity acquisition with budget gates? | Yes, with `execution_target.kind = "managed-agent"`. |
| Work tracker | Can a GitHub issue/Story be the dispatch source without duplicating task state? | Yes for GitHub-backed projects; mirror needed for non-GitHub trackers. |
| Event stream | Can PR/check/log state be normalized into aloop events? | Likely yes, but lower fidelity than sandbox token/tool events. |
| Artifact store | Can PR URL, diff, commits, checks, and logs be stored as artifacts? | Yes, but PR/check artifacts need explicit artifact types. |
| Cost model | Can Actions minutes + Copilot requests/credits fit current cost gates? | Likely needs cost dimensions beyond `estimated_cost_usd`. |
| Security policy | Can eligibility and secret rules be expressed declaratively? | Yes, but must include repo/org GitHub policies and content-exclusion caveat. |
| Cancellation | Can the daemon stop work consistently? | Unknown; must verify. |
| Result contract | Can outcome be represented as `needs_review`/PR artifact rather than direct structured agent output? | Yes, if managed-agent runs are PR-producing tasks only. |

Success means the backend plugs into orchestration as another execution target. Failure means the spike should name the exact primitive that is too narrow, not work around it with ad hoc GitHub-specific behavior in the orchestrator.

### Dispatch Policy

Copilot cloud agent should be eligible only when all of these are true:

- project repository is hosted on GitHub
- task can be represented as a GitHub issue/prompt
- desired output is a branch/PR
- one-repo, one-branch, one-PR constraint is acceptable
- user/org has Copilot cloud agent enabled
- budget policy permits Actions minutes and Copilot requests/credits

It should not be used for:

- arbitrary shell-only exec steps
- benchmark attempts needing tight environment control
- non-GitHub repositories
- tasks that require multiple repositories in one run
- tasks that require aloop-owned secrets inside the execution environment
- tasks where output must be structured through `aloop-agent` during the turn

### Suggested Package

If the spike succeeds, add:

```text
packages/managed-agent-github-copilot/
```

Responsibilities:

- start task through CLI/API
- normalize task identifiers
- poll/watch task state
- collect PR artifacts
- emit managed-agent events
- report estimated/observed cost

Do not put this inside an Azure or sandbox package.

### Scheduler Integration

Add a provider/backend candidate type:

```ts
type ExecutionTarget =
  | { kind: "sandbox"; backend: "host" | "devcontainer" | "azure-dynamic-session" | "self-hosted-worker" }
  | { kind: "managed-agent"; backend: "github-copilot-cloud" };
```

The scheduler should treat Copilot cloud agent as capacity with different constraints:

- limited by Copilot subscription and GitHub Actions budget
- cannot stream arbitrary provider token usage
- output is delayed until PR/log events are visible
- cancellation semantics may be weaker

### Tracker Integration

For GitHub-backed projects, aloop can reuse the tracker issue as the dispatch source:

1. Refinement creates/updates a GitHub issue with the exact task spec.
2. aloop assigns Copilot cloud agent to that issue.
3. Copilot creates a PR.
4. aloop watches PR events and check runs.
5. aloop records the PR as the task artifact and asks for review/merge according to normal policy.

For non-GitHub tracker projects, aloop should create a temporary GitHub issue only if the user has explicitly configured a GitHub mirror/repository target.

## Definition of Done

- [ ] Preflight script confirms repo eligibility.
- [ ] `gh agent-task create` starts a real Copilot cloud task.
- [ ] API issue-assignment path starts a real Copilot cloud task.
- [ ] Result ingestion script captures PR URL, branch, commits, diff, check status, and logs/comments.
- [ ] Setup steps are verified on a project with dependencies.
- [ ] Security notes cover repo scope, firewall, branch protection, secrets, and self-hosted runner caveats.
- [ ] Cost note records Actions minutes and Copilot request/credit usage for at least 3 tasks.
- [ ] Recommendation states whether to build `packages/managed-agent-github-copilot`.

## Open Questions

- Does `gh agent-task create` expose stable machine-readable task/session IDs, or only human-facing logs?
- Is there a documented API to list/watch cloud agent sessions independent of PR/issue state?
- Is cancellation exposed through CLI/API?
- Which token types work reliably for API assignment in personal repos and organizations?
- Can model/custom-agent selection be set reliably through API, or only UI/CLI?
- How quickly do PR/check events appear after task start?
- Can aloop inject enough structured task context without polluting public issue/PR text?
- Can cloud agent be used safely with private dependencies without disabling too much firewall protection?

## Sources

- About GitHub Copilot cloud agent: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- Starting Copilot sessions: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/start-copilot-sessions
- Configure the development environment: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment
- Customize the cloud agent firewall: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-firewall
- Configure cloud agent runners: https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-organization/configure-runner-for-coding-agent
- GitHub Copilot SDK: https://github.com/github/copilot-sdk
- SDK and CLI compatibility: https://docs.github.com/en/copilot/how-tos/copilot-sdk/troubleshooting/sdk-and-cli-compatibility
- Copilot premium requests: https://docs.github.com/en/billing/concepts/product-billing/github-copilot-premium-requests
