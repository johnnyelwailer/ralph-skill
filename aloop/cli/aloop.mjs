#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorkspace } from './lib/project.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_ENTRYPOINT = path.join(__dirname, 'dist', 'index.js');

function printHelp() {
  console.log('aloop <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  resolve    Resolve project root/hash and setup paths');
  console.log('  discover   Delegates to dist CLI (temporary)');
  console.log('  scaffold   Delegates to dist CLI (temporary)');
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

  if (command === 'discover' || command === 'scaffold' || command === 'dashboard') {
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
