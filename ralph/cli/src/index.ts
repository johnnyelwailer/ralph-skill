import { Command } from 'commander';
import { resolveCommand } from './commands/resolve.js';
import { discoverCommand } from './commands/discover.js';
import { scaffoldCommand } from './commands/scaffold.js';
import { dashboardCommand } from './commands/dashboard.js';

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
  .command('scaffold')
  .description('Scaffold project workdir and prompts')
  .option('--project-root <path>', 'Project root override')
  .option('--language <language>', 'Language override')
  .option('--provider <provider>', 'Provider override')
  .option('--enabled-providers <providers...>', 'Enabled providers list or csv values')
  .option('--round-robin-order <providers...>', 'Round-robin provider order list or csv values')
  .option('--spec-files <files...>', 'Spec file list or csv values')
  .option('--validation-commands <commands...>', 'Validation command list or csv values')
  .option('--safety-rules <rules...>', 'Safety rule list or csv values')
  .option('--mode <mode>', 'Loop mode', 'plan-build-review')
  .option('--templates-dir <path>', 'Template directory override')
  .option('--output <mode>', 'Output format: json or text', 'json')
  .action(scaffoldCommand);

program
  .command('dashboard')
  .description('Launch real-time progress dashboard')
  .option('-p, --port <number>', 'Port to run the dashboard on', '3000')
  .option('--session-dir <path>', 'Session directory containing status.json and log.jsonl')
  .option('--workdir <path>', 'Project work directory containing TODO.md and related docs')
  .option('--assets-dir <path>', 'Directory containing bundled dashboard frontend assets')
  .action(dashboardCommand);

program.parse();
