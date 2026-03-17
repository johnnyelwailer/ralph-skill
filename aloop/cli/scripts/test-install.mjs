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
import { mkdtempSync, rmSync, readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const keep = process.argv.includes('--keep');
const prefix = mkdtempSync(join(tmpdir(), 'aloop-test-install-'));
let isolatedHome = null;
let isolatedProject = null;

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

  // Verify loop scripts are present in the installed package
  // The installed package layout: <prefix>/lib/node_modules/aloop-cli/dist/bin/
  const installedDistDir = join(prefix, 'lib', 'node_modules', 'aloop-cli', 'dist');
  const installedBinDir = join(installedDistDir, 'bin');
  const requiredScripts = ['loop.sh', 'loop.ps1'];
  for (const scriptName of requiredScripts) {
    const scriptPath = join(installedBinDir, scriptName);
    if (!existsSync(scriptPath)) {
      throw new Error(`Loop script missing from installed package: ${scriptPath}`);
    }
  }
  console.error(`Verified loop scripts present at ${installedBinDir}`);

  // Verify packaged-install behavior in a clean, non-repo project/home:
  // setup must bootstrap loop scripts to ~/.aloop/bin from the installed package,
  // then start must succeed using those scripts.
  isolatedHome = mkdtempSync(join(tmpdir(), 'aloop-test-home-'));
  isolatedProject = mkdtempSync(join(tmpdir(), 'aloop-test-project-'));
  mkdirSync(isolatedProject, { recursive: true });
  writeFileSync(join(isolatedProject, 'SPEC.md'), '# test spec\n', 'utf8');

  const runWithIsolatedHome = (args, options = {}) =>
    execSync(`${bin} ${args}`, {
      cwd: isolatedProject,
      env: { ...process.env, HOME: isolatedHome },
      stdio: ['inherit', 'pipe', 'inherit'],
      encoding: 'utf8',
      ...options,
    });

  console.error(`Running packaged setup/start validation in ${isolatedProject} (HOME=${isolatedHome}) ...`);
  runWithIsolatedHome('setup --non-interactive --providers codex --spec SPEC.md');

  const bootstrappedBinDir = join(isolatedHome, '.aloop', 'bin');
  for (const scriptName of requiredScripts) {
    const bootstrappedPath = join(bootstrappedBinDir, scriptName);
    if (!existsSync(bootstrappedPath)) {
      throw new Error(`Loop script missing from bootstrapped HOME bin: ${bootstrappedPath}`);
    }

    const installedScript = readFileSync(join(installedBinDir, scriptName));
    const bootstrappedScript = readFileSync(bootstrappedPath);
    if (!installedScript.equals(bootstrappedScript)) {
      throw new Error(`Bootstrapped script does not match installed package copy: ${scriptName}`);
    }
  }

  const startJson = runWithIsolatedHome('start --max-iterations 1 --output json');
  const startResult = JSON.parse(startJson);
  if (!startResult?.session_id) {
    throw new Error('start did not return a session_id in JSON output');
  }
  runWithIsolatedHome(`stop ${startResult.session_id} --output json`);
  rmSync(isolatedHome, { recursive: true, force: true });
  rmSync(isolatedProject, { recursive: true, force: true });
  isolatedHome = null;
  isolatedProject = null;
  console.error('Verified packaged-install setup/start with isolated HOME and package-sourced loop scripts');

  if (keep) {
    console.error(`\n✓ test-install passed (prefix kept at ${prefix})`);
    // Print binary path to stdout for capture
    console.log(bin);
  } else {
    rmSync(prefix, { recursive: true, force: true });
    console.error('\n✓ test-install passed');
  }
} catch (err) {
  if (isolatedHome) rmSync(isolatedHome, { recursive: true, force: true });
  if (isolatedProject) rmSync(isolatedProject, { recursive: true, force: true });
  if (!keep) rmSync(prefix, { recursive: true, force: true });
  throw err;
}
