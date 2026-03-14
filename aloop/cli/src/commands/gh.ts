import { Command } from 'commander';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
