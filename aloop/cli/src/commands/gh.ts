import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Define the gh command
export const ghCommand = new Command('gh')
  .description('Policy-enforced GitHub operations');

// Common options for gh subcommands
function addGhSubcommand(name: string, description: string) {
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

// Register subcommands
addGhSubcommand('pr-create', 'Create a pull request');
addGhSubcommand('pr-comment', 'Comment on a pull request');
addGhSubcommand('issue-comment', 'Comment on an issue');
addGhSubcommand('issue-create', 'Create an issue (orchestrator only)');
addGhSubcommand('issue-close', 'Close an issue (orchestrator only)');
addGhSubcommand('pr-merge', 'Merge a pull request (orchestrator only)');
addGhSubcommand('branch-delete', 'Delete a branch (always rejected)');

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

async function executeGhOperation(operation: string, options: any) {
  const sessionDir = getSessionDir(options.homeDir, options.session);
  const requestFile = options.request;
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

  // Evaluate policy
  const { allowed, reason, enforced } = evaluatePolicy(operation, role, requestPayload, sessionPolicy);

  const timestamp = new Date().toISOString();
  const requestFileName = path.basename(requestFile);

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
    const logEntry: any = {
      timestamp,
      event: 'gh_operation',
      type: operation,
      session: options.session,
      role: role,
      request_file: requestFileName,
      result: 'success', // Simulated success
      enforced: enforced
    };
    
    // Scaffolding: Simulated response attributes based on operation
    if (operation === 'pr-create') {
      logEntry.pr_number = 15;
    }

    appendLog(sessionDir, logEntry);
    console.log(JSON.stringify(logEntry));
    // Here we would typically write the response file, e.g., 001-pr-create.json into .aloop/responses/
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
        return { allowed: true };
      case 'issue-close':
        if (!includesAloopAutoLabel(payload.target_labels)) {
          return { allowed: false, reason: 'issue-close requires aloop/auto-scoped target validation' };
        }
        return { allowed: true };
      case 'pr-create':
        return { allowed: true, enforced: { base: 'agent/trunk', repo: sessionPolicy.repo } };
      case 'pr-merge':
        // Only to agent/trunk, only squash merge
        return { allowed: true, enforced: { base: 'agent/trunk', merge_method: 'squash', repo: sessionPolicy.repo } };
      case 'pr-comment':
      case 'issue-comment':
        if (!includesAloopAutoLabel(payload.target_labels)) {
          return { allowed: false, reason: `${operation} requires aloop/auto-scoped target validation` };
        }
        return { allowed: true };
      case 'branch-delete':
        return { allowed: false, reason: 'branch-delete rejected - cleanup is manual' };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  }

  return { allowed: false, reason: `Unknown role: ${role}` };
}
