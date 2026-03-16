#!/usr/bin/env node
// Packs the CLI as a tarball and installs it to an isolated prefix,
// exactly like a real user would experience `npm install -g aloop-cli`.
//
// Usage:
//   node scripts/test-install.mjs          # install, verify, clean up
//   node scripts/test-install.mjs --keep   # install, print binary path, keep prefix
//
// With --keep, prints the binary path to stdout (last line) for scripts to capture:
//   ALOOP_BIN=$(npm run --silent test-install -- --keep | tail -1)

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const keep = process.argv.includes('--keep');
const prefix = mkdtempSync(join(tmpdir(), 'aloop-test-install-'));

try {
  const cliDir = new URL('..', import.meta.url).pathname;
  console.error(`Packing ${cliDir} ...`);
  execSync(`npm pack --pack-destination ${prefix}`, { cwd: cliDir, stdio: ['inherit', 'inherit', 'inherit'] });

  const tgz = readdirSync(prefix).find(f => f.endsWith('.tgz'));
  if (!tgz) throw new Error('npm pack produced no .tgz file');

  const tgzPath = join(prefix, tgz);
  console.error(`Installing ${tgz} to ${prefix} ...`);
  execSync(`npm install -g --prefix ${prefix} ${tgzPath}`, { stdio: ['inherit', 'inherit', 'inherit'] });

  const bin = join(prefix, 'bin', 'aloop');
  console.error(`Verifying ${bin} ...`);
  execSync(`${bin} --help`, { stdio: ['inherit', 'pipe', 'inherit'] });

  if (keep) {
    console.error(`\n✓ test-install passed (prefix kept at ${prefix})`);
    // Print binary path to stdout for capture
    console.log(bin);
  } else {
    rmSync(prefix, { recursive: true, force: true });
    console.error('\n✓ test-install passed');
  }
} catch (err) {
  if (!keep) rmSync(prefix, { recursive: true, force: true });
  throw err;
}
