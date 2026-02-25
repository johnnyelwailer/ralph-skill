import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { discoverWorkspace, scaffoldWorkspace } from './project.js';

test('discoverWorkspace resolves project details and language signals', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-discover-'));
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }), 'utf8');
  await writeFile(path.join(tempRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }), 'utf8');
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.equal(result.project.root, tempRoot);
  assert.equal(result.project.hash.length, 8);
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.ok(result.context.spec_candidates.includes('SPEC.md'));
});

test('scaffoldWorkspace writes config and prompt files with substitutions', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }), 'utf8');
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Specs: {{SPEC_FILES}}\n{{VALIDATION_COMMANDS}}\n{{SAFETY_RULES}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build {{SPEC_FILES}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review {{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer {{PROVIDER_HINTS}}', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    specFiles: ['SPEC.md'],
    validationCommands: ['npm test'],
    safetyRules: ['Do not delete files'],
    provider: 'copilot',
  });

  const config = await readFile(result.config_path, 'utf8');
  const planPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.match(config, /provider: 'copilot'/);
  assert.match(config, /- 'SPEC.md'/);
  assert.match(planPrompt, /Specs: SPEC.md/);
  assert.match(planPrompt, /- npm test/);
  assert.match(planPrompt, /- Do not delete files/);
});
