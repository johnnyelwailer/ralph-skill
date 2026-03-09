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
  .action(resolveCommand);

program
  .command('discover')
  .description('Discover workspace specs, files, and validation commands')
  .option('--project-root <path>', 'Project root override')
  .option('--output <mode>', 'Output format: json or text', 'json')
  .action(discoverCommand);

program
  .command('setup')
  .description('Interactive setup and scaffold for aloop project')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--spec <path>', 'Specification file to use')
  .option('--providers <providers>', 'Comma-separated list of providers to enable')
  .option('--non-interactive', 'Skip interactive prompts and use defaults')
  .action(setupCommand);

program
  .command('scaffold')
  .description('Scaffold project workdir and prompts')
  .option('--project-root <path>', 'Project root override')
  .option('--language <language>', 'Language override')
  .option('--provider <provider>', 'Provider override')
  .option('--enabled-providers <providers...>', 'Enabled providers list or csv values')
  .option('--round-robin-order <providers...>', 'Round-robin provider order list or csv values')
  .option('--spec-files <files...>', 'Spec file list or csv values')
  .option('--reference-files <files...>', 'Reference file list or csv values')
  .option('--validation-commands <commands...>', 'Validation command list or csv values')
  .option('--safety-rules <rules...>', 'Safety rule list or csv values')
  .option('--mode <mode>', 'Loop mode', 'plan-build-review')
  .option('--templates-dir <path>', 'Template directory override')
  .option('--output <mode>', 'Output format: json or text', 'json')
  .action(scaffoldCommand);

program
  .command('start')
  .description('Start an aloop session for the current project')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--provider <provider>', 'Provider override')
  .option('--mode <mode>', 'Loop mode override')
  .option('--plan', 'Shortcut for --mode plan')
  .option('--build', 'Shortcut for --mode build')
  .option('--review', 'Shortcut for --mode review')
  .option('--in-place', 'Run in project root instead of creating a git worktree')
  .option('--max-iterations <number>', 'Max iteration override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(startCommand);

program
  .command('dashboard')
  .description('Launch real-time progress dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '3000')
  .option('--session-dir <path>', 'Session directory containing status.json and log.jsonl')
  .option('--workdir <path>', 'Project work directory containing TODO.md and related docs')
  .option('--assets-dir <path>', 'Directory containing bundled dashboard frontend assets')
  .action(dashboardCommand);

program
  .command('status')
  .description('Show all active sessions and provider health')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .option('--watch', 'Auto-refresh status display')
  .action(statusCommand);

program
  .command('active')
  .description('List active sessions')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(activeCommand);

program
  .command('stop <session-id>')
  .description('Stop a session by session-id')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(stopCommand);

program
  .command('update')
  .description('Refresh ~/.aloop runtime assets from the current repo checkout')
  .option('--repo-root <path>', 'Path to aloop source repository root')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(updateCommand);

program.addCommand(ghCommand);

program
  .command('debug-env', { hidden: true })
  .description('Print current environment variables (for testing)')
  .action(() => {
    console.log(JSON.stringify(process.env));
  });

program.parse();
