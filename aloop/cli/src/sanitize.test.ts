import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');

type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runCli(args: string[], envOverrides: Record<string, string>): Promise<CliResult> {
  const entrypoint = path.resolve(__dirname, 'index.ts');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', entrypoint, ...args], {
      cwd: cliRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...envOverrides },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('CLAUDECODE is sanitized from process.env at entry', async () => {
  const result = await runCli(['debug-env'], { CLAUDECODE: 'true' });
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.CLAUDECODE, undefined, 'CLAUDECODE should be removed from process.env');
});
