delete process.env.CLAUDECODE;
import './sanitize.js';
import { Command } from 'commander';
import { resolveCommand } from './commands/resolve.js';
import { discoverCommand } from './commands/discover.js';
import { scaffoldCommand } from './commands/scaffold.js';
import { dashboardCommand } from './commands/dashboard.js';
import { statusCommand } from './commands/status.js';
import { activeCommand } from './commands/active.js';
import { stopCommand } from './commands/stop.js';
import { ghCommand } from './commands/gh.js';
import { startCommand } from './commands/start.js';
import { setupCommand } from './commands/setup.js';
import { updateCommand } from './commands/update.js';
import { devcontainerCommand, verifyDevcontainerCommand } from './commands/devcontainer.js';
import { orchestrateCommand } from './commands/orchestrate.js';
import { steerCommand } from './commands/steer.js';
import { processRequestsCommand } from './commands/process-requests.js';

import { withErrorHandling } from './lib/error-handling.js';

const program = new Command();

program
  .name('aloop')
  .description('Aloop CLI for dashboard and project orchestration')
  .version('1.0.0');

program
  .command('resolve')
  .description('Resolve project workspace and configuration')
  .option('--project-root <path>', 'Project root override')
  .option('--output <mode>', 'Output format: json or text', 'json')
  .action(withErrorHandling(resolveCommand));

program
  .command('discover')
  .description('Discover workspace specs, files, and validation commands')
  .option('--project-root <path>', 'Project root override')
  .option('--output <mode>', 'Output format: json or text', 'json')
  .action(withErrorHandling(discoverCommand));

program
  .command('setup')
  .description('Interactive setup and scaffold for aloop project')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--spec <path>', 'Specification file to use')
  .option('--providers <providers>', 'Comma-separated list of providers to enable')
  .option('--provider <provider>', 'Alias for --providers (comma-separated)')
  .option('--mode <mode>', 'Setup mode: loop or orchestrate')
  .option('--autonomy-level <level>', 'Autonomy level: cautious, balanced, or autonomous')
  .option('--non-interactive', 'Skip interactive prompts and use defaults')
  .action(withErrorHandling(setupCommand));

program
  .command('scaffold')
  .description('Scaffold project workdir and prompts')
  .option('--project-root <path>', 'Project root override')
  .option('--language <language>', 'Language override')
  .option('--provider <provider>', 'Provider override')
  .option('--enabled-providers <providers...>', 'Enabled providers list or csv values')
  .option('--autonomy-level <level>', 'Autonomy level: cautious, balanced, or autonomous')
  .option('--round-robin-order <providers...>', 'Round-robin provider order list or csv values')
  .option('--spec-files <files...>', 'Spec file list or csv values')
  .option('--reference-files <files...>', 'Reference file list or csv values')
  .option('--validation-commands <commands...>', 'Validation command list or csv values')
  .option('--safety-rules <rules...>', 'Safety rule list or csv values')
  .option('--mode <mode>', 'Loop mode', 'plan-build-review')
  .option('--templates-dir <path>', 'Template directory override')
  .option('--output <mode>', 'Output format: json or text', 'json')
  .action(withErrorHandling(scaffoldCommand));

program
  .command('start')
  .description('Start an aloop session for the current project')
  .argument('[session-id]', 'Session ID to resume (used with --launch resume)')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--provider <provider>', 'Provider override')
  .option('--mode <mode>', 'Loop mode override')
  .option('--launch <mode>', 'Session launch mode: start, restart, or resume')
  .option('--plan', 'Shortcut for --mode plan')
  .option('--build', 'Shortcut for --mode build')
  .option('--review', 'Shortcut for --mode review')
  .option('--in-place', 'Run in project root instead of creating a git worktree')
  .option('--max-iterations <number>', 'Max iteration override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(startCommand));

program
  .command('dashboard')
  .description('Launch real-time progress dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '3000')
  .option('--session-dir <path>', 'Session directory containing status.json and log.jsonl')
  .option('--workdir <path>', 'Project work directory containing TODO.md and related docs')
  .option('--assets-dir <path>', 'Directory containing bundled dashboard frontend assets')
  .action(withErrorHandling(dashboardCommand));

program
  .command('status')
  .description('Show all active sessions and provider health')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .option('--watch', 'Auto-refresh status display')
  .action(withErrorHandling(statusCommand));

program
  .command('active')
  .description('List active sessions')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(activeCommand));

program
  .command('stop <session-id>')
  .description('Stop a session by session-id')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(stopCommand));

program
  .command('update')
  .description('Refresh ~/.aloop runtime assets from the current repo checkout')
  .option('--repo-root <path>', 'Path to aloop source repository root')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(updateCommand));

program
  .command('devcontainer')
  .description('Generate or augment .devcontainer/devcontainer.json for isolated agent execution')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(devcontainerCommand));

program
  .command('devcontainer-verify')
  .description('Verify devcontainer builds, starts, and passes all checks')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(verifyDevcontainerCommand));

program
  .command('orchestrate')
  .description('Decompose spec into issues, dispatch child loops, and merge PRs')
  .option('--spec <paths>', 'Spec file(s) or glob pattern (e.g. "SPEC.md specs/*.md")', 'SPEC.md')
  .option('--concurrency <number>', 'Max concurrent child loops', '3')
  .option('--trunk <branch>', 'Target branch for merged PRs', 'agent/trunk')
  .option('--issues <numbers>', 'Comma-separated issue numbers to process')
  .option('--label <label>', 'GitHub label to filter issues')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--autonomy-level <level>', 'Autonomy level: cautious, balanced, or autonomous')
  .option('--plan <file>', 'Decomposition plan JSON file with issues and dependencies')
  .option('--plan-only', 'Create issues without launching loops')
  .option('--budget <usd>', 'Session budget cap in USD (pauses dispatch at 80%)')
  .option('--interval <ms>', 'Scan loop interval in milliseconds (default: 30000)')
  .option('--max-iterations <n>', 'Max scan loop iterations (default: 100)')
  .option('--auto-merge', 'Create a PR from trunk to main when all issues complete')
  .option('--resume <session-id>', 'Resume a previously stopped orchestrator session')
  .option('--home-dir <path>', 'Home directory override')
  .option('--project-root <path>', 'Project root override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(orchestrateCommand));

program
  .command('steer <instruction>')
  .description('Send a steering instruction to an active session')
  .option('--session <id>', 'Target session ID (auto-detected if only one active)')
  .option('--affects-completed-work <value>', 'Whether instruction affects completed work: yes, no, or unknown', 'unknown')
  .option('--overwrite', 'Overwrite an existing queued steering instruction')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(steerCommand));

program
  .command('process-requests')
  .description('Process pending orchestrator requests (called by loop.sh between iterations)')
  .requiredOption('--session-dir <path>', 'Orchestrator session directory')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(processRequestsCommand));

// For subcommands like ghCommand that might have their own actions, we might need to be careful,
// but since ghCommand is a Command object added via addCommand, we can't wrap it easily here.
// However, the TODO specifically mentions "aloop setup --autonomy-level invalid, aloop start (no config), aloop orchestrate --autonomy-level foo, aloop resolve --project-root /nonexistent", which are all top level.
program.addCommand(ghCommand);

program
  .command('debug-env', { hidden: true })
  .description('Print current environment variables (for testing)')
  .action(withErrorHandling(() => {
    console.log(JSON.stringify(process.env));
  }));

process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) {
    console.error(`Error: ${reason.message}`);
  } else {
    console.error(`Error: ${String(reason)}`);
  }
  process.exit(1);
});

await program.parseAsync();
