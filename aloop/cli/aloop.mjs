#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverWorkspace } from './lib/discover.mjs';
import { resolveWorkspace } from './lib/project.mjs';
import { scaffoldWorkspace } from './lib/scaffold.mjs';
import {
  resolveHomeDir,
  listActiveSessions,
  readProviderHealth,
  stopSession,
} from './lib/session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_ENTRYPOINT = path.join(__dirname, 'dist', 'index.js');

function printHelp() {
  console.log('aloop <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  resolve    Resolve project root/hash and setup paths');
  console.log('  discover   Discover workspace metadata and setup defaults');
  console.log('  scaffold   Write project config and prompt templates');
  console.log('  status     Show all active sessions and provider health');
  console.log('  active     List active sessions');
  console.log('  stop       Stop a session by session-id');
  console.log('  dashboard  Delegates to dist CLI (temporary)');
}

function parseResolveArgs(argv) {
  const options = { output: 'json' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--project-root') {
      i += 1;
      options.projectRoot = argv[i];
      continue;
    }

    if (arg === '--home-dir') {
      i += 1;
      options.homeDir = argv[i];
      continue;
    }

    if (arg === '--output') {
      i += 1;
      options.output = argv[i];
      continue;
    }

    throw new Error(`Unknown option for resolve: ${arg}`);
  }

  if (!options.projectRoot && argv.includes('--project-root')) {
    throw new Error('--project-root requires a value');
  }

  if (!options.homeDir && argv.includes('--home-dir')) {
    throw new Error('--home-dir requires a value');
  }

  if (options.output !== 'json' && options.output !== 'text') {
    throw new Error(`Invalid output mode: ${options.output}`);
  }

  return options;
}

function parseDiscoverArgs(argv) {
  const options = { output: 'json' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--project-root') {
      i += 1;
      options.projectRoot = argv[i];
      continue;
    }

    if (arg === '--home-dir') {
      i += 1;
      options.homeDir = argv[i];
      continue;
    }

    if (arg === '--output') {
      i += 1;
      options.output = argv[i];
      continue;
    }

    throw new Error(`Unknown option for discover: ${arg}`);
  }

  if (!options.projectRoot && argv.includes('--project-root')) {
    throw new Error('--project-root requires a value');
  }

  if (!options.homeDir && argv.includes('--home-dir')) {
    throw new Error('--home-dir requires a value');
  }

  if (options.output !== 'json' && options.output !== 'text') {
    throw new Error(`Invalid output mode: ${options.output}`);
  }

  return options;
}

function parseListValues(argv, index) {
  const values = [];
  let i = index;
  while (i < argv.length && !argv[i].startsWith('--')) {
    values.push(argv[i]);
    i += 1;
  }
  return { values, nextIndex: i - 1 };
}

function parseScaffoldArgs(argv) {
  const options = { output: 'json' };
  const listFlags = new Map([
    ['--enabled-providers', 'enabledProviders'],
    ['--round-robin-order', 'roundRobinOrder'],
    ['--spec-files', 'specFiles'],
    ['--reference-files', 'referenceFiles'],
    ['--validation-commands', 'validationCommands'],
    ['--safety-rules', 'safetyRules'],
  ]);
  const scalarFlags = new Map([
    ['--project-root', 'projectRoot'],
    ['--home-dir', 'homeDir'],
    ['--output', 'output'],
    ['--language', 'language'],
    ['--provider', 'provider'],
    ['--mode', 'mode'],
    ['--templates-dir', 'templatesDir'],
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (listFlags.has(arg)) {
      const { values, nextIndex } = parseListValues(argv, i + 1);
      if (values.length === 0) {
        throw new Error(`${arg} requires one or more values`);
      }
      options[listFlags.get(arg)] = values;
      i = nextIndex;
      continue;
    }

    if (scalarFlags.has(arg)) {
      i += 1;
      if (!argv[i] || argv[i].startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      options[scalarFlags.get(arg)] = argv[i];
      continue;
    }

    throw new Error(`Unknown option for scaffold: ${arg}`);
  }

  if (options.output !== 'json' && options.output !== 'text') {
    throw new Error(`Invalid output mode: ${options.output}`);
  }

  return options;
}

function parseStatusArgs(argv) {
  const options = { output: 'text' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--home-dir') {
      i += 1;
      options.homeDir = argv[i];
      continue;
    }

    if (arg === '--output') {
      i += 1;
      options.output = argv[i];
      continue;
    }

    throw new Error(`Unknown option for status: ${arg}`);
  }

  if (options.output !== 'json' && options.output !== 'text') {
    throw new Error(`Invalid output mode: ${options.output}`);
  }

  return options;
}

function parseActiveArgs(argv) {
  const options = { output: 'text' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--home-dir') {
      i += 1;
      options.homeDir = argv[i];
      continue;
    }

    if (arg === '--output') {
      i += 1;
      options.output = argv[i];
      continue;
    }

    throw new Error(`Unknown option for active: ${arg}`);
  }

  if (options.output !== 'json' && options.output !== 'text') {
    throw new Error(`Invalid output mode: ${options.output}`);
  }

  return options;
}

function parseStopArgs(argv) {
  if (argv.length === 0 || argv[0].startsWith('--')) {
    throw new Error('stop requires a session-id argument');
  }

  const sessionId = argv[0];
  const options = { sessionId, output: 'text' };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--home-dir') {
      i += 1;
      options.homeDir = argv[i];
      continue;
    }

    if (arg === '--output') {
      i += 1;
      options.output = argv[i];
      continue;
    }

    throw new Error(`Unknown option for stop: ${arg}`);
  }

  if (options.output !== 'json' && options.output !== 'text') {
    throw new Error(`Invalid output mode: ${options.output}`);
  }

  return options;
}

function formatRelativeTime(isoString) {
  if (!isoString) return 'unknown';
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function formatHealthLine(provider, health) {
  const status = health.status ?? 'unknown';
  let detail = '';
  if (status === 'cooldown' && health.cooldown_until) {
    const resumeMs = new Date(health.cooldown_until).getTime() - Date.now();
    if (resumeMs > 0) {
      const mins = Math.ceil(resumeMs / 60000);
      const failures = health.consecutive_failures ?? 0;
      detail = `(${failures} failure${failures !== 1 ? 's' : ''}, resumes in ${mins}m)`;
    }
  } else if (status === 'degraded' && health.failure_reason) {
    const hints = { auth: 'auth error — run `gh auth login`' };
    detail = `(${hints[health.failure_reason] ?? health.failure_reason})`;
  } else if (status === 'healthy' && health.last_success) {
    detail = `(last success: ${formatRelativeTime(health.last_success)})`;
  }
  return `  ${provider.padEnd(10)} ${status.padEnd(12)} ${detail}`.trimEnd();
}


function runDistCommand(command, argv) {
  if (!existsSync(DIST_ENTRYPOINT)) {
    console.error(`dist entrypoint not found: ${DIST_ENTRYPOINT}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [DIST_ENTRYPOINT, command, ...argv], {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  process.exit(1);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'resolve') {
    const options = parseResolveArgs(argv);
    const result = await resolveWorkspace(options);

    if (options.output === 'text') {
      const configStatus = result.setup.config_exists ? '' : ' (not found)';
      console.log(`Project: ${result.project.name} [${result.project.hash}]`);
      console.log(`Root: ${result.project.root}`);
      console.log(`Project config: ${result.setup.config_path}${configStatus}`);
      return;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'discover') {
    const options = parseDiscoverArgs(argv);
    const result = await discoverWorkspace(options);

    if (options.output === 'text') {
      console.log(`Project: ${result.project.name} [${result.project.hash}]`);
      console.log(`Root: ${result.project.root}`);
      console.log(`Detected language: ${result.context.detected_language} (${result.context.language_confidence})`);
      console.log(`Providers installed: ${result.providers.installed.join(', ')}`);
      console.log(`Spec candidates: ${result.context.spec_candidates.join(', ')}`);
      console.log(`Reference candidates: ${result.context.reference_candidates.join(', ')}`);
      return;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'scaffold') {
    const options = parseScaffoldArgs(argv);
    const result = await scaffoldWorkspace(options);

    if (options.output === 'text') {
      console.log(`Wrote config: ${result.config_path}`);
      console.log(`Wrote prompts: ${result.prompts_dir}`);
      return;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'status') {
    const options = parseStatusArgs(argv);
    const homeDir = resolveHomeDir(options.homeDir);
    const sessions = await listActiveSessions(homeDir);
    const health = await readProviderHealth(homeDir);

    if (options.output === 'json') {
      console.log(JSON.stringify({ sessions, health }, null, 2));
      return;
    }

    if (sessions.length === 0) {
      console.log('No active sessions.');
    } else {
      console.log('Active Sessions:');
      for (const s of sessions) {
        const age = formatRelativeTime(s.started_at);
        const iter = s.iteration != null ? `iter ${s.iteration}` : '';
        const phase = s.phase ?? '';
        const detail = [iter, phase].filter(Boolean).join(', ');
        console.log(`  ${s.session_id}  pid=${s.pid ?? 'n/a'}  ${s.state}  ${detail}  (${age})`);
        if (s.work_dir) console.log(`    workdir: ${s.work_dir}`);
      }
    }

    const healthEntries = Object.entries(health);
    if (healthEntries.length > 0) {
      console.log('');
      console.log('Provider Health:');
      for (const [provider, data] of healthEntries) {
        console.log(formatHealthLine(provider, data));
      }
    }

    return;
  }

  if (command === 'active') {
    const options = parseActiveArgs(argv);
    const homeDir = resolveHomeDir(options.homeDir);
    const sessions = await listActiveSessions(homeDir);

    if (options.output === 'json') {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }

    if (sessions.length === 0) {
      console.log('No active sessions.');
      return;
    }

    for (const s of sessions) {
      const age = formatRelativeTime(s.started_at);
      console.log(`${s.session_id}  pid=${s.pid ?? 'n/a'}  ${s.state}  ${s.work_dir ?? ''}  (${age})`);
    }

    return;
  }

  if (command === 'stop') {
    const options = parseStopArgs(argv);
    const homeDir = resolveHomeDir(options.homeDir);
    const result = await stopSession(homeDir, options.sessionId);

    if (options.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
      if (!result.success) process.exit(1);
      return;
    }

    if (!result.success) {
      console.error(result.reason);
      process.exit(1);
    }

    console.log(`Session ${options.sessionId} stopped.`);
    return;
  }

  if (command === 'dashboard') {
    runDistCommand(command, argv);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
