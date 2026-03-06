#!/usr/bin/env node
/**
 * Aloop CLI - Stable Entrypoint
 * This file implements core machine tasks using Node.js built-ins and lib/*.mjs.
 * Other tasks (dashboard, gh, etc.) are delegated to the bundled TypeScript CLI.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverWorkspace, scaffoldWorkspace, normalizeList } from './lib/project.mjs';
import { resolveHomeDir, listActiveSessions, readProviderHealth, stopSession } from './lib/session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

// Help text
const help = `
Aloop CLI - Agentic Loop Orchestrator

Usage:
  aloop <command> [options]

Core Commands (no-dependency):
  resolve     Resolve project workspace and configuration
  discover    Discover workspace specs, files, and validation commands
  scaffold    Scaffold project workdir and prompts
  status      Show all active sessions and provider health
  active      List active sessions
  stop <id>   Stop a session by session-id

Extended Commands (requires build):
  start       Start an aloop session
  setup       Interactive setup and scaffold
  dashboard   Launch real-time progress dashboard
  gh          GitHub operations proxy

Options:
  --project-root <path>  Override project root
  --home-dir <path>      Override home directory
  --output <json|text>   Output format (default: text for status/active/stop, json for others)
  --help                 Show this help
`;

if (!command || args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}

// Simple argument parser
function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      if (typeof value === 'string') i++;
      
      if (options[key]) {
        if (Array.isArray(options[key])) {
          options[key].push(value);
        } else {
          options[key] = [options[key], value];
        }
      } else {
        options[key] = value;
      }
    }
  }
  return options;
}

const options = parseArgs(args.slice(1));

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

async function run() {
  try {
    switch (command) {
      case 'resolve': {
        const discovery = await discoverWorkspace(options);
        const result = {
          project: discovery.project,
          setup: discovery.setup,
        };
        if (options.output === 'text') {
          console.log(`Project: ${result.project.name} [${result.project.hash}]`);
          console.log(`Root: ${result.project.root}`);
          console.log(`Project config: ${result.setup.config_path}`);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case 'discover': {
        const discovery = await discoverWorkspace(options);
        if (options.output === 'text') {
          console.log(`Workspace discovered at ${discovery.discovered_at}`);
          console.log(`Language: ${discovery.context.detected_language} (${discovery.context.language_confidence} confidence)`);
          console.log(`Providers: ${discovery.providers.installed.join(', ')}`);
        } else {
          console.log(JSON.stringify(discovery, null, 2));
        }
        break;
      }

      case 'scaffold': {
        const result = await scaffoldWorkspace(options);
        if (options.output === 'text') {
          console.log(`Scaffold complete for project hash: ${result.project_hash}`);
          console.log(`Config: ${result.config_path}`);
          console.log(`Prompts: ${result.prompts_dir}`);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case 'status': {
        const homeDir = resolveHomeDir(options.homeDir);
        const sessions = await listActiveSessions(homeDir);
        const health = await readProviderHealth(homeDir);

        if (options.output === 'json') {
          console.log(JSON.stringify({ sessions, health }, null, 2));
          break;
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
        break;
      }

      case 'active': {
        const homeDir = resolveHomeDir(options.homeDir);
        const sessions = await listActiveSessions(homeDir);
        if (options.output === 'json') {
          console.log(JSON.stringify(sessions, null, 2));
        } else {
          if (sessions.length === 0) {
            console.log('No active sessions.');
          } else {
            for (const s of sessions) {
              console.log(`${s.session_id} (${s.state})`);
            }
          }
        }
        break;
      }

      case 'stop': {
        const sessionId = args[1];
        if (!sessionId) {
          console.error('Error: session-id required for stop command.');
          process.exit(1);
        }
        const homeDir = resolveHomeDir(options.homeDir);
        const result = await stopSession(homeDir, sessionId);
        if (result.success) {
          if (options.output === 'json') {
            console.log(JSON.stringify({ success: true, session_id: sessionId }));
          } else {
            console.log(`Stopped session: ${sessionId}`);
          }
        } else {
          console.error(`Error: ${result.reason}`);
          process.exit(1);
        }
        break;
      }

      case 'debug-env': {
        console.log(JSON.stringify(process.env));
        break;
      }

      default: {
        // Delegate to bundled CLI for non-core tasks
        const bundlePath = join(__dirname, 'dist', 'index.js');
        if (existsSync(bundlePath)) {
          // CLAUDECODE sanitization as per SPEC
          delete process.env.CLAUDECODE;
          
          await import('./dist/index.js');
        } else {
          console.error(`Error: unknown command "${command}" and aloop CLI bundle not found.`);
          console.error('Run "npm run build" in aloop/cli to enable extended commands.');
          process.exit(1);
        }
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

run();
