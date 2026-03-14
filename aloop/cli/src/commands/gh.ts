import { Command } from 'commander';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startCommandWithDeps, type StartCommandOptions, type StartCommandResult } from './start.js';

const execFileAsync = promisify(execFile);

// Exported for test mocking — all gh CLI execution goes through this object
export const ghExecutor = {
  async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('gh', args);
  }
};

// Define the gh command
export const ghCommand = new Command('gh')
  .description('Policy-enforced GitHub operations');

export interface GhStartCommandOptions {
  issue: string | number;
  spec?: string;
  provider?: string;
  max?: string | number;
  repo?: string;
  homeDir?: string;
  projectRoot?: string;
  output?: 'json' | 'text';
}

export interface GhStartResult {
  issue: {
    number: number;
    title: string;
    url: string;
    repo: string | null;
  };
  session: {
    id: string;
    dir: string;
    prompts_dir: string;
    work_dir: string;
    branch: string | null;
    worktree: boolean;
    pid: number;
  };
  base_branch: 'agent/main' | 'main';
  pr: { number: number | null; url: string | null } | null;
  issue_comment_posted: boolean;
  completion_state: string | null;
  pending_completion: boolean;
  warnings: string[];
}

interface GhIssueCommentView {
  author?: { login?: string };
  body?: string;
}

interface GhIssueView {
  number: number;
  title: string;
  body?: string;
  url: string;
  labels?: Array<{ name?: string }>;
  comments?: GhIssueCommentView[];
}

interface GhStartDeps {
  startSession: (options: StartCommandOptions) => Promise<StartCommandResult>;
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  execGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  readFile: (filePath: string, encoding: BufferEncoding) => string;
  writeFile: (filePath: string, content: string) => void;
  existsSync: (filePath: string) => boolean;
  cwd: () => string;
}

const defaultGhStartDeps: GhStartDeps = {
  startSession: (options) => startCommandWithDeps(options),
  execGh: (args) => ghExecutor.exec(args),
  execGit: (args) => execFileAsync('git', args),
  readFile: (filePath, encoding) => fs.readFileSync(filePath, encoding),
  writeFile: (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
  existsSync: (filePath) => fs.existsSync(filePath),
  cwd: () => process.cwd(),
};

// Common options for gh subcommands
function addGhRequestSubcommand(name: string, description: string) {
  return ghCommand
    .command(name)
    .description(description)
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--request <file>', 'Request JSON file path')
    .option('--role <role>', 'Role: child-loop or orchestrator', 'child-loop')
    .option('--home-dir <dir>', 'Home directory override')
    .action(async (options) => {
      await executeGhOperation(name, options);
    });
}

function addGhSinceSubcommand(name: string, description: string) {
  return ghCommand
    .command(name)
    .description(description)
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--since <timestamp>', 'Only return comments created at/after this timestamp (ISO-8601)')
    .option('--role <role>', 'Role: child-loop or orchestrator', 'orchestrator')
    .option('--home-dir <dir>', 'Home directory override')
    .action(async (options) => {
      await executeGhOperation(name, options);
    });
}


ghCommand
  .command('start')
  .description('Start a GitHub-linked aloop session for an issue')
  .requiredOption('--issue <number>', 'GitHub issue number')
  .option('--spec <path>', 'Additional specification file to include in prompt context')
  .option('--provider <provider>', 'Provider override for the launched loop')
  .option('--max <number>', 'Max iteration override')
  .option('--repo <owner/repo>', 'Explicit GitHub repository (defaults to issue URL owner/repo)')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(async (options: GhStartCommandOptions) => {
    const result = await ghStartCommandWithDeps(options);
    if (options.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Started GH-linked session ${result.session.id} for issue #${result.issue.number}.`);
    console.log(`Branch: ${result.session.branch}`);
    console.log(`Base branch: ${result.base_branch}`);
    console.log(`Work dir: ${result.session.work_dir}`);
    if (result.pending_completion) {
      console.log('Loop is still running; PR creation and issue summary comment will occur when the session reaches a terminal state.');
    } else if (result.pr?.url) {
      console.log(`PR: ${result.pr.url}`);
      console.log('Posted summary comment back to the source issue.');
    }
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`Warning: ${warning}`);
      }
    }
  });

// Register subcommands
addGhRequestSubcommand('pr-create', 'Create a pull request');
addGhRequestSubcommand('pr-comment', 'Comment on a pull request');
addGhRequestSubcommand('issue-comment', 'Comment on an issue');
addGhRequestSubcommand('issue-create', 'Create an issue (orchestrator only)');
addGhRequestSubcommand('issue-close', 'Close an issue (orchestrator only)');
addGhRequestSubcommand('issue-label', 'Add/remove issue labels (orchestrator only)');
addGhRequestSubcommand('pr-merge', 'Merge a pull request (orchestrator only)');
addGhRequestSubcommand('branch-delete', 'Delete a branch (always rejected)');
addGhSinceSubcommand('issue-comments', 'List issue comments since a timestamp (orchestrator only)');
addGhSinceSubcommand('pr-comments', 'List pull request review comments since a timestamp (orchestrator only)');

type SessionPolicyContext = {
  repo: string;
  assignedIssueNumber?: number;
  childCreatedPrNumbers: number[];
};

function getSessionDir(homeDir: string | undefined, sessionId: string): string {
  const baseHome = homeDir || os.homedir();
  return path.join(baseHome, '.aloop', 'sessions', sessionId);
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}


function sanitizeBranchSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    return 'issue';
  }
  return slug.slice(0, 40).replace(/-+$/g, '');
}

function extractRepoFromIssueUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/issues\/\d+/i);
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2]}`;
}

function parsePrReference(raw: string): { number: number | null; url: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { number: null, url: null };
  }
  const match = trimmed.match(/\/pull\/(\d+)/);
  return {
    number: match ? Number.parseInt(match[1], 10) : null,
    url: trimmed,
  };
}

function extractPositiveIntegers(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => parsePositiveInteger(value))
    .filter((value): value is number => value !== undefined);
}

function normalizeIssuePayload(payload: unknown, expectedIssueNumber: number): GhIssueView {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid issue payload returned by gh issue view.');
  }

  const issue = payload as Record<string, unknown>;
  const number = parsePositiveInteger(issue.number);
  if (number !== expectedIssueNumber) {
    throw new Error(`gh issue view returned unexpected issue number: ${String(issue.number)}`);
  }

  const title = typeof issue.title === 'string' ? issue.title.trim() : '';
  const url = typeof issue.url === 'string' ? issue.url.trim() : '';
  if (!title || !url) {
    throw new Error('Issue payload is missing required title/url fields.');
  }

  const labels = Array.isArray(issue.labels)
    ? issue.labels
      .filter((entry): entry is { name?: string } => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({ name: typeof entry.name === 'string' ? entry.name : undefined }))
    : [];

  const comments = Array.isArray(issue.comments)
    ? issue.comments
      .filter((entry): entry is { author?: { login?: string }; body?: string } => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        author: entry.author && typeof entry.author === 'object' ? { login: typeof entry.author.login === 'string' ? entry.author.login : undefined } : undefined,
        body: typeof entry.body === 'string' ? entry.body : undefined,
      }))
    : [];

  return {
    number,
    title,
    body: typeof issue.body === 'string' ? issue.body : '',
    url,
    labels,
    comments,
  };
}

function buildIssueContextBlock(issue: GhIssueView, specContent: string | null): string {
  const labels = (issue.labels ?? [])
    .map((label) => label.name)
    .filter((name): name is string => Boolean(name));

  const commentLines = (issue.comments ?? [])
    .slice(-10)
    .map((comment, index) => {
      const author = comment.author?.login ?? 'unknown';
      const body = (comment.body ?? '').trim().replace(/\s+/g, ' ');
      const snippet = body.length > 160 ? `${body.slice(0, 157)}...` : body;
      return `${index + 1}. @${author}: ${snippet}`;
    });

  const parts: string[] = [
    '<!-- aloop-gh-issue-context:start -->',
    '# GitHub Issue Requirements',
    '',
    `Issue: #${issue.number} — ${issue.title}`,
    `URL: ${issue.url}`,
    `Labels: ${labels.length > 0 ? labels.join(', ') : '(none)'}`,
    '',
    '## Issue Body',
    '',
    (issue.body ?? '').trim() || '(empty)',
  ];

  if (commentLines.length > 0) {
    parts.push('', '## Recent Comments', '', ...commentLines);
  }

  if (specContent !== null) {
    parts.push('', '## Additional Spec Context (--spec)', '', specContent.trim() || '(empty)');
  }

  parts.push('', '<!-- aloop-gh-issue-context:end -->', '');
  return parts.join('\n');
}

function upsertIssueContextPrompt(existingContent: string, contextBlock: string): string {
  const pattern = /<!-- aloop-gh-issue-context:start -->[\s\S]*?<!-- aloop-gh-issue-context:end -->\n*/g;
  const stripped = existingContent.replace(pattern, '').trimStart();
  return `${contextBlock}${stripped.endsWith('\n') ? stripped : `${stripped}\n`}`;
}

function isTerminalState(value: unknown): value is 'exited' | 'stopped' {
  return value === 'exited' || value === 'stopped';
}

function loadJsonObject(filePath: string, deps: GhStartDeps): Record<string, unknown> {
  if (!deps.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(deps.readFile(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function ghStartCommandWithDeps(options: GhStartCommandOptions, deps: GhStartDeps = defaultGhStartDeps): Promise<GhStartResult> {
  const issueNumber = parsePositiveInteger(options.issue);
  if (!issueNumber) {
    throw new Error('gh start requires --issue <number>.');
  }

  const warnings: string[] = [];
  const issueViewArgs = ['issue', 'view', String(issueNumber), '--json', 'number,title,body,url,labels,comments'];
  const requestedRepo = typeof options.repo === 'string' && options.repo.trim() ? options.repo.trim() : null;
  if (requestedRepo) {
    issueViewArgs.push('--repo', requestedRepo);
  }
  const issueRaw = await deps.execGh(issueViewArgs);
  const issuePayload = JSON.parse(issueRaw.stdout) as unknown;
  const issue = normalizeIssuePayload(issuePayload, issueNumber);

  const issueRepo = requestedRepo ?? extractRepoFromIssueUrl(issue.url);
  if (!issueRepo) {
    warnings.push('Could not infer repository from issue URL; PR creation/link-back will require --repo.');
  }

  let specContent: string | null = null;
  if (typeof options.spec === 'string' && options.spec.trim()) {
    const specPath = path.isAbsolute(options.spec) ? options.spec : path.join(deps.cwd(), options.spec);
    if (!deps.existsSync(specPath)) {
      throw new Error(`--spec file not found: ${specPath}`);
    }
    specContent = deps.readFile(specPath, 'utf8');
  }

  const started = await deps.startSession({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    provider: options.provider,
    maxIterations: options.max,
  });

  if (!started.worktree || !started.worktree_path || !started.branch) {
    throw new Error('gh start requires a git worktree session. Remove in-place/worktree fallback constraints and retry.');
  }

  const desiredBranch = `agent/issue-${issue.number}-${sanitizeBranchSlug(issue.title)}`;
  if (started.branch !== desiredBranch) {
    await deps.execGit(['-C', started.worktree_path, 'branch', '-m', desiredBranch]);
  }

  const planPromptPath = path.join(started.prompts_dir, 'PROMPT_plan.md');
  if (!deps.existsSync(planPromptPath)) {
    throw new Error(`Missing planner prompt: ${planPromptPath}`);
  }
  const currentPlanPrompt = deps.readFile(planPromptPath, 'utf8');
  const issueContext = buildIssueContextBlock(issue, specContent);
  deps.writeFile(planPromptPath, upsertIssueContextPrompt(currentPlanPrompt, issueContext));

  const metaPath = path.join(started.session_dir, 'meta.json');
  const statusPath = path.join(started.session_dir, 'status.json');
  const configPath = path.join(started.session_dir, 'config.json');

  const meta = loadJsonObject(metaPath, deps);
  meta.branch = desiredBranch;
  meta.gh_issue_number = issue.number;
  meta.gh_issue_url = issue.url;
  meta.gh_repo = issueRepo;
  deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  const config = loadJsonObject(configPath, deps);
  const createdPrNumbers = extractPositiveIntegers(config.created_pr_numbers);
  config.repo = issueRepo;
  config.issue_number = issue.number;
  config.assignedIssueNumber = issue.number;
  config.created_pr_numbers = createdPrNumbers;
  config.childCreatedPrNumbers = createdPrNumbers;
  config.role = 'child-loop';
  config.issue_url = issue.url;
  deps.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  let baseBranch: 'agent/main' | 'main' = 'main';
  const projectRoot = typeof meta.project_root === 'string' && meta.project_root.trim() ? meta.project_root : (options.projectRoot ?? deps.cwd());
  try {
    await deps.execGit(['-C', projectRoot, 'rev-parse', '--verify', 'agent/main']);
    baseBranch = 'agent/main';
  } catch {
    try {
      await deps.execGit(['-C', projectRoot, 'branch', 'agent/main', 'main']);
      baseBranch = 'agent/main';
    } catch {
      warnings.push('Unable to create agent/main from main; PR base will remain main.');
      baseBranch = 'main';
    }
  }

  const status = loadJsonObject(statusPath, deps);
  const completionState = typeof status.state === 'string' ? status.state : null;
  let pr: { number: number | null; url: string | null } | null = null;
  let issueCommentPosted = false;
  let pendingCompletion = true;

  if (isTerminalState(completionState) && issueRepo) {
    const prTitle = `[aloop] ${issue.title}`;
    const prBody = `Automated implementation for issue #${issue.number}.\n\nCloses #${issue.number}`;
    const prCreate = await deps.execGh([
      'pr', 'create',
      '--repo', issueRepo,
      '--base', baseBranch,
      '--head', desiredBranch,
      '--title', prTitle,
      '--body', prBody,
    ]);
    pr = parsePrReference(prCreate.stdout);

    if (pr.number !== null) {
      const next = new Set<number>(createdPrNumbers);
      next.add(pr.number);
      config.created_pr_numbers = Array.from(next.values());
      config.childCreatedPrNumbers = Array.from(next.values());
      deps.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    const summary = [
      `Aloop session ${started.session_id} completed for #${issue.number}.`,
      pr?.url ? `Created PR: ${pr.url}` : 'Created PR (URL unavailable).',
      `Branch: ${desiredBranch}`,
      `State: ${completionState}`,
    ].join('\n');
    await deps.execGh(['issue', 'comment', String(issue.number), '--repo', issueRepo, '--body', summary]);
    issueCommentPosted = true;
    pendingCompletion = false;
  } else {
    pendingCompletion = true;
  }

  return {
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      repo: issueRepo,
    },
    session: {
      id: started.session_id,
      dir: started.session_dir,
      prompts_dir: started.prompts_dir,
      work_dir: started.work_dir,
      branch: desiredBranch,
      worktree: started.worktree,
      pid: started.pid,
    },
    base_branch: baseBranch,
    pr,
    issue_comment_posted: issueCommentPosted,
    completion_state: completionState,
    pending_completion: pendingCompletion,
    warnings,
  };
}

function includesAloopAutoLabel(targetLabels: unknown): boolean {
  if (!Array.isArray(targetLabels)) {
    return false;
  }

  return targetLabels.some((label) => label === 'aloop/auto');
}

function appendLog(sessionDir: string, entry: any) {
  const logFile = path.join(sessionDir, 'log.jsonl');
  const logData = JSON.stringify(entry) + String.fromCharCode(10);
  if (fs.existsSync(sessionDir)) {
    fs.appendFileSync(logFile, logData);
  } else {
    // Scaffold: if session dir doesn't exist, we skip or error out. 
    // We'll just create it for testing purposes if we need to.
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.appendFileSync(logFile, logData);
  }
}

function requiresRequestFile(operation: string): boolean {
  return operation !== 'issue-comments' && operation !== 'pr-comments';
}

function buildGhArgs(operation: string, payload: any, enforced: any): string[] {
  const repo = enforced.repo;

  switch (operation) {
    case 'pr-create': {
      const args = ['pr', 'create', '--repo', repo, '--base', enforced.base];
      if (payload.title) args.push('--title', String(payload.title));
      if (payload.body) args.push('--body', String(payload.body));
      if (payload.head) args.push('--head', String(payload.head));
      if (Array.isArray(payload.labels)) {
        for (const label of payload.labels) {
          args.push('--label', String(label));
        }
      }
      return args;
    }
    case 'pr-comment': {
      const prNum = enforced.pr_number ?? payload.pr_number;
      const args = ['pr', 'comment', String(prNum), '--repo', repo];
      if (payload.body) args.push('--body', String(payload.body));
      return args;
    }
    case 'issue-comment': {
      const issueNum = enforced.issue_number ?? payload.issue_number;
      const args = ['issue', 'comment', String(issueNum), '--repo', repo];
      if (payload.body) args.push('--body', String(payload.body));
      return args;
    }
    case 'issue-create': {
      const args = ['issue', 'create', '--repo', repo];
      if (payload.title) args.push('--title', String(payload.title));
      if (payload.body) args.push('--body', String(payload.body));
      if (Array.isArray(payload.labels)) {
        for (const label of payload.labels) {
          args.push('--label', String(label));
        }
      }
      return args;
    }
    case 'issue-close': {
      const issueNum = payload.issue_number;
      return ['issue', 'close', String(issueNum), '--repo', repo];
    }
    case 'issue-label': {
      const issueNum = enforced.issue_number ?? payload.issue_number;
      const action = enforced.label_action ?? payload.label_action;
      const label = enforced.label ?? payload.label;
      const args = ['issue', 'edit', String(issueNum), '--repo', repo];
      if (action === 'add') {
        args.push('--add-label', String(label));
      } else {
        args.push('--remove-label', String(label));
      }
      return args;
    }
    case 'pr-merge': {
      const prNum = payload.pr_number;
      return ['pr', 'merge', String(prNum), '--repo', repo, '--squash'];
    }
    case 'issue-comments': {
      return ['api', `repos/${repo}/issues/comments`, '--method', 'GET', '-f', `since=${String(enforced.since)}`];
    }
    case 'pr-comments': {
      return ['api', `repos/${repo}/pulls/comments`, '--method', 'GET', '-f', `since=${String(enforced.since)}`];
    }
    default:
      throw new Error(`Cannot build gh args for operation: ${operation}`);
  }
}

function parseGhOutput(operation: string, stdout: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const trimmed = stdout.trim();

  if (operation === 'pr-create') {
    const match = trimmed.match(/\/pull\/(\d+)/);
    if (match) {
      result.pr_number = parseInt(match[1], 10);
    }
    if (trimmed) result.url = trimmed;
  } else if (operation === 'issue-create') {
    const match = trimmed.match(/\/issues\/(\d+)/);
    if (match) {
      result.issue_number = parseInt(match[1], 10);
    }
    if (trimmed) result.url = trimmed;
  } else if (operation === 'issue-comments' || operation === 'pr-comments') {
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const comments = Array.isArray(parsed) ? parsed : [];
    result.comments = comments;
    result.comment_count = comments.length;
  }

  return result;
}

async function executeGhOperation(operation: string, options: any) {
  const sessionDir = getSessionDir(options.homeDir, options.session);
  const requestFile = options.request;
  const needsRequestFile = requiresRequestFile(operation);
  const role = options.role;

  // Load session config
  let sessionPolicy: SessionPolicyContext;
  const configFile = path.join(sessionDir, 'config.json');
  try {
    if (!fs.existsSync(configFile)) {
      throw new Error(`Session config not found: ${configFile}`);
    }
    const configContent = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(configContent);
    if (!config || typeof config.repo !== 'string' || !config.repo.trim()) {
      throw new Error(`Invalid session config: missing or invalid 'repo' in ${configFile}`);
    }

    const assignedIssueNumber = parsePositiveInteger(config.issue_number);
    const childCreatedPrNumbers = Array.isArray(config.created_pr_numbers)
      ? config.created_pr_numbers
        .map((value: unknown) => parsePositiveInteger(value))
        .filter((value: number | undefined): value is number => value !== undefined)
      : [];

    sessionPolicy = {
      repo: config.repo,
      assignedIssueNumber,
      childCreatedPrNumbers,
    };
  } catch (e: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event: 'gh_operation_denied',
      type: operation,
      session: options.session,
      role: role,
      reason: e.message
    };
    appendLog(sessionDir, logEntry);
    console.error(JSON.stringify(logEntry));
    process.exit(1);
  }

  // Read request payload
  let requestPayload: any = {};
  if (needsRequestFile) {
    if (typeof requestFile !== 'string' || !requestFile.trim()) {
      console.error(`Request file not provided for operation: ${operation}`);
      process.exit(1);
    }

    if (fs.existsSync(requestFile)) {
      try {
        requestPayload = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
      } catch (e) {
        console.error(`Failed to parse request file: ${requestFile}`);
        process.exit(1);
      }
    } else {
      console.error(`Request file not found: ${requestFile}`);
      process.exit(1);
    }
  } else {
    requestPayload = {
      since: options.since,
    };
  }

  // Evaluate policy
  const { allowed, reason, enforced } = evaluatePolicy(operation, role, requestPayload, sessionPolicy);

  const timestamp = new Date().toISOString();
  const requestFileName = typeof requestFile === 'string' ? path.basename(requestFile) : undefined;

  if (!allowed) {
    const logEntry = {
      timestamp,
      event: 'gh_operation_denied',
      type: operation,
      session: options.session,
      role: role,
      reason: reason || `${operation} not allowed for ${role} role`
    };
    appendLog(sessionDir, logEntry);
    console.error(JSON.stringify(logEntry));
    process.exit(1);
  } else {
    // Build and execute real gh CLI command
    const ghArgs = buildGhArgs(operation, requestPayload, enforced);

    let ghResult: { stdout: string; stderr: string };
    try {
      ghResult = await ghExecutor.exec(ghArgs);
    } catch (e: any) {
      const errorEntry = {
        timestamp,
        event: 'gh_operation_error',
        type: operation,
        session: options.session,
        role: role,
        request_file: requestFileName,
        error: e.message,
        stderr: e.stderr || '',
        enforced: enforced,
      };
      appendLog(sessionDir, errorEntry);
      console.error(JSON.stringify(errorEntry));
      process.exit(1);
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = parseGhOutput(operation, ghResult.stdout);
    } catch (e: any) {
      const parseErrorEntry: any = {
        timestamp,
        event: 'gh_operation_error',
        type: operation,
        session: options.session,
        role: role,
        error: e.message,
        stderr: ghResult.stderr || '',
        enforced: enforced,
      };
      if (requestFileName) {
        parseErrorEntry.request_file = requestFileName;
      }
      appendLog(sessionDir, parseErrorEntry);
      console.error(JSON.stringify(parseErrorEntry));
      process.exit(1);
    }

    const logEntry: any = {
      timestamp,
      event: 'gh_operation',
      type: operation,
      session: options.session,
      role: role,
      result: 'success',
      enforced: enforced,
      ...parsed,
    };
    if (requestFileName) {
      logEntry.request_file = requestFileName;
    }

    appendLog(sessionDir, logEntry);
    console.log(JSON.stringify(logEntry));
  }
}

function evaluatePolicy(
  operation: string,
  role: string,
  payload: any,
  sessionPolicy: SessionPolicyContext,
): { allowed: boolean, reason?: string, enforced?: any } {
  if (payload.repo && payload.repo !== sessionPolicy.repo) {
    return {
      allowed: false,
      reason: `Mismatched repo: requested ${payload.repo}, but session is bound to ${sessionPolicy.repo}`,
    };
  }

  if (typeof payload.base === 'string' && payload.base.trim().toLowerCase() === 'main') {
    return { allowed: false, reason: 'Operations targeting main are rejected; human must promote to main' };
  }

  if (role === 'child-loop') {
    switch (operation) {
      case 'pr-create':
        return { 
          allowed: true, 
          enforced: { base: 'agent/trunk', repo: sessionPolicy.repo }
        };
      case 'issue-comment': {
        const targetIssueNumber = parsePositiveInteger(payload.issue_number);
        if (targetIssueNumber === undefined) {
          return { allowed: false, reason: 'Child issue-comment requires numeric issue_number' };
        }
        if (sessionPolicy.assignedIssueNumber === undefined) {
          return { allowed: false, reason: 'Child session is missing assigned issue scope in config' };
        }
        if (targetIssueNumber !== sessionPolicy.assignedIssueNumber) {
          return {
            allowed: false,
            reason: `Child issue-comment must target assigned issue #${sessionPolicy.assignedIssueNumber}`,
          };
        }
        return { allowed: true, enforced: { issue_number: sessionPolicy.assignedIssueNumber, repo: sessionPolicy.repo } };
      }
      case 'pr-comment': {
        const targetPrNumber = parsePositiveInteger(payload.pr_number);
        if (targetPrNumber === undefined) {
          return { allowed: false, reason: 'Child pr-comment requires numeric pr_number' };
        }
        if (!sessionPolicy.childCreatedPrNumbers.includes(targetPrNumber)) {
          return {
            allowed: false,
            reason: `Child pr-comment must target a PR created by this session (${targetPrNumber} is out of scope)`,
          };
        }
        return { allowed: true, enforced: { pr_number: targetPrNumber, repo: sessionPolicy.repo } };
      }
      case 'pr-merge':
      case 'issue-create':
      case 'issue-close':
      case 'issue-label':
      case 'issue-comments':
      case 'pr-comments':
      case 'branch-delete':
        return { allowed: false, reason: `${operation} not allowed for child-loop role` };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  } else if (role === 'orchestrator') {
    switch (operation) {
      case 'issue-create':
        if (!payload.labels || !payload.labels.includes('aloop/auto')) {
           return { allowed: false, reason: 'Must include aloop/auto label' };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case 'issue-close':
        if (!includesAloopAutoLabel(payload.target_labels)) {
          return { allowed: false, reason: 'issue-close requires aloop/auto-scoped target validation' };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case 'pr-create':
        return { allowed: true, enforced: { base: 'agent/trunk', repo: sessionPolicy.repo } };
      case 'pr-merge':
        // Only to agent/trunk, only squash merge
        return { allowed: true, enforced: { base: 'agent/trunk', merge_method: 'squash', repo: sessionPolicy.repo } };
      case 'issue-label': {
        if (!includesAloopAutoLabel(payload.target_labels)) {
          return { allowed: false, reason: 'issue-label requires aloop/auto-scoped target validation' };
        }
        const issueNumber = parsePositiveInteger(payload.issue_number);
        if (issueNumber === undefined) {
          return { allowed: false, reason: 'issue-label requires numeric issue_number' };
        }
        const action = payload.label_action;
        if (action !== 'add' && action !== 'remove') {
          return { allowed: false, reason: 'issue-label requires label_action: add or remove' };
        }
        if (payload.label !== 'aloop/blocked-on-human') {
          return { allowed: false, reason: 'issue-label only permits aloop/blocked-on-human' };
        }
        return {
          allowed: true,
          enforced: {
            repo: sessionPolicy.repo,
            issue_number: issueNumber,
            label_action: action,
            label: 'aloop/blocked-on-human',
          }
        };
      }
      case 'issue-comments':
      case 'pr-comments':
        if (typeof payload.since !== 'string' || !payload.since.trim()) {
          return { allowed: false, reason: `${operation} requires --since timestamp` };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo, since: payload.since.trim() } };
      case 'pr-comment':
      case 'issue-comment':
        if (!includesAloopAutoLabel(payload.target_labels)) {
          return { allowed: false, reason: `${operation} requires aloop/auto-scoped target validation` };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case 'branch-delete':
        return { allowed: false, reason: 'branch-delete rejected - cleanup is manual' };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  }

  return { allowed: false, reason: `Unknown role: ${role}` };
}
