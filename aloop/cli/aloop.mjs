#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverWorkspace } from './lib/discover.mjs';
import { resolveWorkspace } from './lib/project.mjs';
import { scaffoldWorkspace } from './lib/scaffold.mjs';

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
