import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

function runCli(args) {
  const repoRoot = process.cwd();
  const cliRoot = path.resolve(repoRoot, 'aloop', 'cli');
  const entrypoint = path.join(cliRoot, 'aloop.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: cliRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function assertCliFailure(result, pattern) {
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, pattern);
}

test('aloop.mjs prints help for --help', async () => {
  const result = await runCli(['--help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^aloop <command> \[options\]/m);
  assert.match(result.stdout, /resolve/);
  assert.match(result.stdout, /discover/);
  assert.match(result.stdout, /scaffold/);
  assert.match(result.stdout, /status/);
  assert.match(result.stdout, /active/);
  assert.match(result.stdout, /stop/);
});

test('aloop.mjs resolve prints project and setup JSON', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-resolve-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await writeFile(path.join(homeRoot, '.aloop', 'config.yml'), "default_provider: codex\n", 'utf8');

  const result = await runCli(['resolve', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.project.root, tempRoot);
  assert.equal(parsed.setup.default_provider, 'codex');
  assert.equal(typeof parsed.project.hash, 'string');
  assert.equal(parsed.project.hash.length, 8);
});

test('aloop.mjs resolve text mode is human-readable', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-resolve-text-'));
  const result = await runCli(['resolve', '--project-root', tempRoot, '--output', 'text']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Project: .* \[[0-9a-f]{8}\]$/m);
  assert.match(result.stdout, new RegExp(`^Root: ${tempRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.match(result.stdout, /^Project config: .+/m);
});

test('aloop.mjs resolve JSON includes config_exists=false when project not configured', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-unconfigured-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  // No project-specific config.yml written under ~/.aloop/projects/<hash>/

  const result = await runCli(['resolve', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.setup.config_exists, false);
  assert.equal(typeof parsed.setup.config_path, 'string');
  assert.ok(parsed.setup.config_path.length > 0);
});

test('aloop.mjs resolve text mode shows "(not found)" when project not configured', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-unconfigured-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });

  const result = await runCli(['resolve', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'text']);
  assert.equal(result.code, 0);

  assert.match(result.stdout, /Project config:/);
  assert.match(result.stdout, /\(not found\)/);
});

test('aloop.mjs rejects unknown commands', async () => {
  const result = await runCli(['nope']);

  assertCliFailure(result, /Unknown command/);
});

test('aloop.mjs resolve rejects invalid --output values', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-resolve-bad-output-'));
  const result = await runCli(['resolve', '--project-root', tempRoot, '--output', 'xml']);

  assertCliFailure(result, /Invalid output mode: xml/);
});

test('aloop.mjs resolve rejects missing --project-root value', async () => {
  const result = await runCli(['resolve', '--project-root']);

  assertCliFailure(result, /--project-root requires a value/);
});

test('aloop.mjs resolve rejects unknown options', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-resolve-unknown-opt-'));
  const result = await runCli(['resolve', '--project-root', tempRoot, '--bogus']);

  assertCliFailure(result, /Unknown option for resolve: --bogus/);
});

test('aloop.mjs discover runs natively and prints discovery JSON', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-discover-'));
  const homeRoot = path.join(tempRoot, 'home');
  const docsDir = path.join(tempRoot, 'docs');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await mkdir(path.join(tempRoot, 'src', 'nested'), { recursive: true });
  await mkdir(docsDir, { recursive: true });
  await writeFile(path.join(homeRoot, '.aloop', 'config.yml'), "default_provider: codex\n", 'utf8');
  await writeFile(path.join(tempRoot, 'README.md'), '# test\n', 'utf8');
  await writeFile(path.join(tempRoot, 'src', 'nested', 'App.csproj'), '<Project />\n', 'utf8');
  await writeFile(path.join(docsDir, 'spec.md'), '# docs spec\n', 'utf8');
  for (let i = 0; i < 10; i += 1) {
    await writeFile(path.join(docsDir, `guide-${String(i).padStart(2, '0')}.md`), `# guide ${i}\n`, 'utf8');
  }

  const result = await runCli(['discover', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.project.root, tempRoot);
  assert.equal(parsed.providers.default_provider, 'codex');
  assert.equal(parsed.context.detected_language, 'dotnet');
  assert.match(parsed.context.language_signals.join(' '), /\*\.csproj/);
  assert.ok(parsed.context.spec_candidates.includes('docs/spec.md'));
  assert.ok(parsed.context.spec_candidates.includes('docs'));

  const specMdMatches = parsed.context.spec_candidates.filter((candidate) => candidate === 'docs/spec.md');
  assert.equal(specMdMatches.length, 1);

  const docsMarkdownCandidates = parsed.context.spec_candidates.filter((candidate) => candidate.startsWith('docs/') && candidate.endsWith('.md'));
  assert.ok(docsMarkdownCandidates.some((candidate) => candidate.startsWith('docs/guide-')));

  const preorderedDocs = new Set(['docs/SPEC.md', 'docs/spec.md']);
  const dynamicDocsCandidates = docsMarkdownCandidates.filter((candidate) => !preorderedDocs.has(candidate));
  assert.ok(dynamicDocsCandidates.length <= 8);
});

test('aloop.mjs discover text mode prints concrete fields', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-discover-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await writeFile(path.join(homeRoot, '.aloop', 'config.yml'), "default_provider: codex\n", 'utf8');
  await writeFile(path.join(tempRoot, 'README.md'), '# hello\n', 'utf8');

  const result = await runCli(['discover', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'text']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Project: .* \[[0-9a-f]{8}\]$/m);
  assert.match(result.stdout, /^Detected language: \w+ \(\w+\)$/m);
  assert.match(result.stdout, /^Providers installed: .*$/m);
  assert.match(result.stdout, /^Spec candidates: .*$/m);
  assert.match(result.stdout, /^Reference candidates: .*$/m);
});

test('aloop.mjs discover rejects missing --home-dir value', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-discover-missing-home-'));
  const result = await runCli(['discover', '--project-root', tempRoot, '--home-dir']);

  assertCliFailure(result, /--home-dir requires a value/);
});

test('aloop.mjs discover rejects invalid --output values', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-discover-bad-output-'));
  const result = await runCli(['discover', '--project-root', tempRoot, '--output', 'yaml']);

  assertCliFailure(result, /Invalid output mode: yaml/);
});

test('aloop.mjs discover rejects unknown options', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-discover-unknown-opt-'));
  const result = await runCli(['discover', '--project-root', tempRoot, '--unknown']);

  assertCliFailure(result, /Unknown option for discover: --unknown/);
});

test('aloop.mjs scaffold runs natively and writes config/prompts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(homeRoot, '.aloop', 'templates');
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec\n', 'utf8');

  for (const name of ['plan', 'build', 'review', 'steer']) {
    await writeFile(path.join(templatesDir, `PROMPT_${name}.md`), 'Spec: {{SPEC_FILES}}\nRules:\n{{SAFETY_RULES}}\n', 'utf8');
  }

  const result = await runCli([
    'scaffold',
    '--project-root',
    tempRoot,
    '--home-dir',
    homeRoot,
    '--templates-dir',
    templatesDir,
    '--provider',
    'codex',
    '--output',
    'json',
  ]);

  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  const configRaw = await readFile(parsed.config_path, 'utf8');
  assert.match(configRaw, /provider:\s+'codex'/);
  const promptRaw = await readFile(path.join(parsed.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.match(promptRaw, /Spec: SPEC\.md/);
});

test('aloop.mjs scaffold text mode prints written paths', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(homeRoot, '.aloop', 'templates');
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec\n', 'utf8');

  for (const name of ['plan', 'build', 'review', 'steer']) {
    await writeFile(path.join(templatesDir, `PROMPT_${name}.md`), 'Spec: {{SPEC_FILES}}\nRules:\n{{SAFETY_RULES}}\n', 'utf8');
  }

  const result = await runCli([
    'scaffold',
    '--project-root',
    tempRoot,
    '--home-dir',
    homeRoot,
    '--templates-dir',
    templatesDir,
    '--provider',
    'codex',
    '--output',
    'text',
  ]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Wrote config: .+config\.yml$/m);
  assert.match(result.stdout, /^Wrote prompts: .+prompts$/m);
});

test('aloop.mjs scaffold rejects missing list values', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-missing-list-'));
  const result = await runCli(['scaffold', '--project-root', tempRoot, '--enabled-providers']);

  assertCliFailure(result, /--enabled-providers requires one or more values/);
});

test('aloop.mjs scaffold rejects missing scalar values', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-missing-scalar-'));
  const result = await runCli(['scaffold', '--project-root', tempRoot, '--provider']);

  assertCliFailure(result, /--provider requires a value/);
});

test('aloop.mjs scaffold rejects invalid --output values', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-bad-output-'));
  const result = await runCli(['scaffold', '--project-root', tempRoot, '--output', 'yaml']);

  assertCliFailure(result, /Invalid output mode: yaml/);
});

test('aloop.mjs scaffold rejects unknown options', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-unknown-opt-'));
  const result = await runCli(['scaffold', '--project-root', tempRoot, '--unsupported-flag']);

  assertCliFailure(result, /Unknown option for scaffold: --unsupported-flag/);
});

test('aloop.mjs active returns empty list when no active.json', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-active-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });

  const result = await runCli(['active', '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 0);
});

test('aloop.mjs active text mode prints "No active sessions" when none found', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-active-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });

  const result = await runCli(['active', '--home-dir', homeRoot]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /No active sessions/);
});

test('aloop.mjs active returns sessions from active.json', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-active-list-'));
  const homeRoot = path.join(tempRoot, 'home');
  const aloopDir = path.join(homeRoot, '.aloop');
  const sessionDir = path.join(aloopDir, 'sessions', 'abc123');
  await mkdir(sessionDir, { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    abc123: {
      pid: 99999,
      session_dir: sessionDir,
      work_dir: '/some/project',
      started_at: new Date().toISOString(),
      provider: 'claude',
      mode: 'plan-build-review',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    iteration: 3,
    phase: 'build',
    provider: 'claude',
    stuck_count: 0,
    state: 'running',
    updated_at: new Date().toISOString(),
  }), 'utf8');

  const result = await runCli(['active', '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].session_id, 'abc123');
  assert.equal(parsed[0].state, 'running');
  assert.equal(parsed[0].phase, 'build');
  assert.equal(parsed[0].iteration, 3);
});

test('aloop.mjs status JSON includes sessions and health', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-status-'));
  const homeRoot = path.join(tempRoot, 'home');
  const aloopDir = path.join(homeRoot, '.aloop');
  const healthDir = path.join(aloopDir, 'health');
  const sessionDir = path.join(aloopDir, 'sessions', 'sess01');
  await mkdir(sessionDir, { recursive: true });
  await mkdir(healthDir, { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    sess01: {
      pid: 88888,
      session_dir: sessionDir,
      work_dir: '/myproject',
      started_at: new Date().toISOString(),
      provider: 'codex',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    iteration: 1,
    phase: 'build',
    provider: 'codex',
    stuck_count: 0,
    state: 'running',
    updated_at: new Date().toISOString(),
  }), 'utf8');
  await writeFile(path.join(healthDir, 'claude.json'), JSON.stringify({
    status: 'healthy',
    last_success: new Date().toISOString(),
    last_failure: null,
    failure_reason: null,
    consecutive_failures: 0,
    cooldown_until: null,
  }), 'utf8');

  const result = await runCli(['status', '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed.sessions));
  assert.equal(parsed.sessions.length, 1);
  assert.equal(parsed.sessions[0].session_id, 'sess01');
  assert.ok(typeof parsed.health === 'object');
  assert.ok('claude' in parsed.health);
  assert.equal(parsed.health.claude.status, 'healthy');
});

test('aloop.mjs status text mode shows session and provider health', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-status-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  const aloopDir = path.join(homeRoot, '.aloop');
  const healthDir = path.join(aloopDir, 'health');
  await mkdir(healthDir, { recursive: true });
  await mkdir(path.join(aloopDir, 'sessions', 'sess02'), { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    sess02: {
      pid: 77777,
      session_dir: path.join(aloopDir, 'sessions', 'sess02'),
      work_dir: '/proj',
      started_at: new Date().toISOString(),
      provider: 'gemini',
      mode: 'plan-build-review',
    },
  }), 'utf8');
  await writeFile(path.join(aloopDir, 'sessions', 'sess02', 'status.json'), JSON.stringify({
    iteration: 2, phase: 'plan', provider: 'gemini', stuck_count: 0, state: 'running', updated_at: new Date().toISOString(),
  }), 'utf8');
  await writeFile(path.join(healthDir, 'gemini.json'), JSON.stringify({
    status: 'healthy', last_success: new Date().toISOString(), last_failure: null,
    failure_reason: null, consecutive_failures: 0, cooldown_until: null,
  }), 'utf8');

  const result = await runCli(['status', '--home-dir', homeRoot]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Active Sessions/);
  assert.match(result.stdout, /sess02/);
  assert.match(result.stdout, /Provider Health/);
  assert.match(result.stdout, /gemini/);
  assert.match(result.stdout, /healthy/);
});

test('aloop.mjs status text mode prints "No active sessions" when none found', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-status-empty-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });

  const result = await runCli(['status', '--home-dir', homeRoot, '--output', 'text']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /No active sessions/);
});

test('aloop.mjs status tolerates malformed session/health JSON', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-status-malformed-'));
  const homeRoot = path.join(tempRoot, 'home');
  const aloopDir = path.join(homeRoot, '.aloop');
  const healthDir = path.join(aloopDir, 'health');
  const sessionDir = path.join(aloopDir, 'sessions', 'badjson');
  await mkdir(sessionDir, { recursive: true });
  await mkdir(healthDir, { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    badjson: {
      pid: 42424,
      session_dir: sessionDir,
      work_dir: '/proj',
      started_at: new Date().toISOString(),
      provider: 'claude',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), '{"state":"running"', 'utf8');
  await writeFile(path.join(healthDir, 'claude.json'), '{"status":"healthy"', 'utf8');
  await writeFile(path.join(healthDir, 'codex.json'), JSON.stringify({
    status: 'degraded',
    failure_reason: 'auth',
  }), 'utf8');

  const result = await runCli(['status', '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.sessions.length, 1);
  assert.equal(parsed.sessions[0].session_id, 'badjson');
  assert.equal(parsed.sessions[0].state, 'unknown');
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.health, 'claude'), false);
  assert.equal(parsed.health.codex.status, 'degraded');
});

test('aloop.mjs status rejects invalid --output values', async () => {
  const result = await runCli(['status', '--output', 'xml']);

  assertCliFailure(result, /Invalid output mode: xml/);
});

test('aloop.mjs status rejects unknown options', async () => {
  const result = await runCli(['status', '--fake-flag']);

  assertCliFailure(result, /Unknown option for status: --fake-flag/);
});

test('aloop.mjs active rejects invalid --output values', async () => {
  const result = await runCli(['active', '--output', 'yaml']);

  assertCliFailure(result, /Invalid output mode: yaml/);
});

test('aloop.mjs active rejects unknown options', async () => {
  const result = await runCli(['active', '--bad-option']);

  assertCliFailure(result, /Unknown option for active: --bad-option/);
});

test('aloop.mjs stop returns error for unknown session in JSON mode', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-stop-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });

  const result = await runCli(['stop', 'no-such-session', '--home-dir', homeRoot, '--output', 'json']);
  assert.notEqual(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.success, false);
  assert.match(parsed.reason, /not found/);
});

test('aloop.mjs stop removes session from active.json and writes history', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-stop-ok-'));
  const homeRoot = path.join(tempRoot, 'home');
  const aloopDir = path.join(homeRoot, '.aloop');
  const sessionDir = path.join(aloopDir, 'sessions', 'stopsess');
  await mkdir(sessionDir, { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    stopsess: {
      pid: 1,
      session_dir: sessionDir,
      work_dir: '/proj',
      started_at: new Date().toISOString(),
      provider: 'claude',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    iteration: 4, phase: 'build', provider: 'claude', stuck_count: 0, state: 'running', updated_at: new Date().toISOString(),
  }), 'utf8');

  const result = await runCli(['stop', 'stopsess', '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.success, true);

  // active.json should not contain the session anymore
  const activeRaw = await readFile(path.join(aloopDir, 'active.json'), 'utf8');
  const active = JSON.parse(activeRaw);
  assert.ok(!('stopsess' in active));

  // history.json should contain the stopped session
  const historyRaw = await readFile(path.join(aloopDir, 'history.json'), 'utf8');
  const history = JSON.parse(historyRaw);
  assert.equal(history.length, 1);
  assert.equal(history[0].session_id, 'stopsess');
  assert.equal(history[0].state, 'stopped');

  // status.json should show stopped state
  const statusRaw = await readFile(path.join(sessionDir, 'status.json'), 'utf8');
  const status = JSON.parse(statusRaw);
  assert.equal(status.state, 'stopped');
});

test('aloop.mjs stop text mode confirms stopped session', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-stop-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  const aloopDir = path.join(homeRoot, '.aloop');
  const sessionDir = path.join(aloopDir, 'sessions', 'sess-text');
  await mkdir(sessionDir, { recursive: true });

  await writeFile(path.join(aloopDir, 'active.json'), JSON.stringify({
    'sess-text': {
      pid: 1,
      session_dir: sessionDir,
      work_dir: '/proj',
      started_at: new Date().toISOString(),
      provider: 'claude',
      mode: 'build',
    },
  }), 'utf8');
  await writeFile(path.join(sessionDir, 'status.json'), JSON.stringify({
    iteration: 1, phase: 'build', provider: 'claude', stuck_count: 0, state: 'running', updated_at: new Date().toISOString(),
  }), 'utf8');

  const result = await runCli(['stop', 'sess-text', '--home-dir', homeRoot, '--output', 'text']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Session sess-text stopped\./);
});

test('aloop.mjs stop rejects missing session id', async () => {
  const result = await runCli(['stop']);

  assertCliFailure(result, /stop requires a session-id argument/);
});

test('aloop.mjs stop rejects invalid --output values', async () => {
  const result = await runCli(['stop', 'abc', '--output', 'yaml']);

  assertCliFailure(result, /Invalid output mode: yaml/);
});

test('aloop.mjs stop rejects unknown options', async () => {
  const result = await runCli(['stop', 'abc', '--unknown']);

  assertCliFailure(result, /Unknown option for stop: --unknown/);
});
