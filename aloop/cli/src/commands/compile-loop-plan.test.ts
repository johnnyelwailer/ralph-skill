import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compileLoopPlan } from './compile-loop-plan.js';

async function setupDirs(prefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const promptsDir = path.join(root, 'prompts');
  const sessionDir = path.join(root, 'session');
  await mkdir(promptsDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  // Write base prompt templates
  await writeFile(path.join(promptsDir, 'PROMPT_plan.md'), '# Planning Mode\n\nPlan content here.\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_build.md'), '# Building Mode\n\nBuild content here.\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_proof.md'), '# Proof Mode\n\nProof content here.\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_qa.md'), '# QA Mode\n\nQA content here.\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_review.md'), '# Review Mode\n\nReview content here.\n', 'utf8');
  return { root, promptsDir, sessionDir };
}

test('compileLoopPlan — plan mode produces single-entry cycle', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-plan-');
  const plan = await compileLoopPlan({
    mode: 'plan',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  assert.deepStrictEqual(plan.cycle, ['PROMPT_plan.md']);
  assert.equal(plan.cyclePosition, 0);
  assert.equal(plan.iteration, 1);
  assert.equal(plan.version, 1);

  // Verify loop-plan.json written
  const planJson = JSON.parse(await readFile(path.join(sessionDir, 'loop-plan.json'), 'utf8'));
  assert.deepStrictEqual(planJson.cycle, ['PROMPT_plan.md']);
});

test('compileLoopPlan — build mode produces single-entry cycle', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-build-');
  const plan = await compileLoopPlan({
    mode: 'build',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  assert.deepStrictEqual(plan.cycle, ['PROMPT_build.md']);
});

test('compileLoopPlan — plan-build mode produces 2-entry cycle', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-pb-');
  const plan = await compileLoopPlan({
    mode: 'plan-build',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  assert.deepStrictEqual(plan.cycle, ['PROMPT_plan.md', 'PROMPT_build.md']);
});

test('compileLoopPlan — plan-build-review produces 8-entry cycle with 5 builds', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-pbr-');
  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_qa.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — adds frontmatter to prompt files', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-fm-');
  await compileLoopPlan({
    mode: 'plan',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_plan.md'), 'utf8');
  assert.ok(content.startsWith('---\n'), 'should start with frontmatter');
  assert.ok(content.includes('agent: plan'), 'should include agent field');
  assert.ok(content.includes('provider: claude'), 'should include provider field');
  assert.ok(content.includes('model: opus'), 'should include model field');
  assert.ok(content.includes('reasoning: high'), 'plan should have high reasoning');
  assert.ok(content.includes('# Planning Mode'), 'should preserve original content');
});

test('compileLoopPlan — build prompt gets medium reasoning', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-reason-');
  await compileLoopPlan({
    mode: 'build',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_build.md'), 'utf8');
  assert.ok(content.includes('reasoning: medium'), 'build should have medium reasoning');
});

test('compileLoopPlan — review prompt gets high reasoning', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-review-reason-');
  await compileLoopPlan({
    mode: 'review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_review.md'), 'utf8');
  assert.ok(content.includes('reasoning: high'), 'review should have high reasoning');
});

test('compileLoopPlan — round-robin creates provider-specific build prompts', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-rr-');
  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude', 'codex', 'gemini'],
    roundRobinOrder: ['claude', 'codex', 'gemini'],
    models: { claude: 'opus', codex: 'gpt-5.3-codex', gemini: 'gemini-3.1-pro-preview' },
  });

  // Cycle should have plan + 3 provider builds + qa + review
  assert.equal(plan.cycle.length, 6);
  assert.equal(plan.cycle[0], 'PROMPT_plan.md');
  assert.equal(plan.cycle[1], 'PROMPT_build_claude.md');
  assert.equal(plan.cycle[2], 'PROMPT_build_codex.md');
  assert.equal(plan.cycle[3], 'PROMPT_build_gemini.md');
  assert.equal(plan.cycle[4], 'PROMPT_qa.md');
  assert.equal(plan.cycle[5], 'PROMPT_review.md');

  // Verify provider-specific prompt files were created
  const claudeBuild = await readFile(path.join(promptsDir, 'PROMPT_build_claude.md'), 'utf8');
  assert.ok(claudeBuild.includes('provider: claude'));
  assert.ok(claudeBuild.includes('model: opus'));
  assert.ok(claudeBuild.includes('# Building Mode'), 'should copy base template content');

  const codexBuild = await readFile(path.join(promptsDir, 'PROMPT_build_codex.md'), 'utf8');
  assert.ok(codexBuild.includes('provider: codex'));
  assert.ok(codexBuild.includes('model: gpt-5.3-codex'));

  const geminiBuild = await readFile(path.join(promptsDir, 'PROMPT_build_gemini.md'), 'utf8');
  assert.ok(geminiBuild.includes('provider: gemini'));
  assert.ok(geminiBuild.includes('model: gemini-3.1-pro-preview'));
});

test('compileLoopPlan — round-robin plan-build creates provider-specific builds', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-rr-pb-');
  const plan = await compileLoopPlan({
    mode: 'plan-build',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude', 'codex'],
    roundRobinOrder: ['claude', 'codex'],
    models: { claude: 'opus', codex: 'gpt-5.3-codex' },
  });

  assert.equal(plan.cycle.length, 3);
  assert.equal(plan.cycle[0], 'PROMPT_plan.md');
  assert.equal(plan.cycle[1], 'PROMPT_build_claude.md');
  assert.equal(plan.cycle[2], 'PROMPT_build_codex.md');
});

test('compileLoopPlan — does not duplicate frontmatter on repeated cycle entries', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-dedup-');
  await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_build.md'), 'utf8');
  // Should only have one frontmatter block
  const frontmatterCount = (content.match(/^---$/gm) || []).length;
  assert.equal(frontmatterCount, 2, 'should have exactly one frontmatter block (2 --- delimiters)');
});

test('compileLoopPlan — replaces existing frontmatter', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-replace-fm-');
  // Write a prompt with existing frontmatter
  await writeFile(
    path.join(promptsDir, 'PROMPT_plan.md'),
    '---\nagent: plan\nprovider: codex\nmodel: old-model\nreasoning: low\n---\n\n# Planning Mode\n',
    'utf8',
  );

  await compileLoopPlan({
    mode: 'plan',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_plan.md'), 'utf8');
  assert.ok(content.includes('provider: claude'), 'should have new provider');
  assert.ok(content.includes('model: opus'), 'should have new model');
  assert.ok(!content.includes('provider: codex'), 'should not have old provider');
  assert.ok(!content.includes('old-model'), 'should not have old model');
});

test('compileLoopPlan — handles missing model gracefully', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-no-model-');
  await compileLoopPlan({
    mode: 'build',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: {},
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_build.md'), 'utf8');
  assert.ok(content.includes('provider: claude'));
  assert.ok(!content.includes('model:'), 'should not include model field when empty');
});

test('compileLoopPlan — loop-plan.json is valid JSON with correct structure', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-json-');
  await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  const planPath = path.join(sessionDir, 'loop-plan.json');
  assert.ok(existsSync(planPath), 'loop-plan.json should exist');

  const planJson = JSON.parse(await readFile(planPath, 'utf8'));
  assert.ok(Array.isArray(planJson.cycle), 'cycle should be an array');
  assert.equal(typeof planJson.cyclePosition, 'number');
  assert.equal(typeof planJson.iteration, 'number');
  assert.equal(typeof planJson.version, 'number');
  assert.equal(planJson.cyclePosition, 0);
  assert.equal(planJson.iteration, 1);
  assert.equal(planJson.version, 1);
});

test('compileLoopPlan — loads cycle from .aloop/pipeline.yml', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-pipeline-yaml-');
  const aloopDir = path.join(root, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'pipeline.yml'), `
pipeline:
  - agent: plan
  - agent: build
    repeat: 2
  - agent: review
  `, 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — loads reasoning from .aloop/agents/*.yml', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-agent-yaml-');
  const agentsDir = path.join(root, '.aloop', 'agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'build.yml'), `
agent: build
prompt: PROMPT_build.md
reasoning:
  effort: high
  `, 'utf8');

  await compileLoopPlan({
    mode: 'build',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  const content = await readFile(path.join(promptsDir, 'PROMPT_build.md'), 'utf8');
  assert.ok(content.includes('reasoning: high'), 'should use high reasoning from build.yml');
});

test('compileLoopPlan — uses custom prompt from .aloop/agents/*.yml', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-custom-prompt-');
  const agentsDir = path.join(root, '.aloop', 'agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'plan.yml'), `
agent: plan
prompt: CUSTOM_PLAN.md
  `, 'utf8');
  await writeFile(path.join(promptsDir, 'CUSTOM_PLAN.md'), '# Custom Plan\n', 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, ['CUSTOM_PLAN.md']);
  const content = await readFile(path.join(promptsDir, 'CUSTOM_PLAN.md'), 'utf8');
  assert.ok(content.includes('agent: plan'));
});

test('compileLoopPlan — round-robin uses pipeline.yml as template', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-rr-pipeline-');
  const aloopDir = path.join(root, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'pipeline.yml'), `
pipeline:
  - agent: plan
  - agent: build
  - agent: review
  `, 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude', 'codex'],
    roundRobinOrder: ['claude', 'codex'],
    models: { claude: 'opus', codex: 'gpt-5.3' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build_claude.md',
    'PROMPT_build_codex.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — plan-build-review without pipeline.yml falls back to plan-build-qa-review', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-no-pipeline-');
  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_qa.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — pipeline.yml with invalid content falls back to hardcoded', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-invalid-pipeline-');
  const aloopDir = path.join(root, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'pipeline.yml'), `
not_pipeline: true
  `, 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_qa.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — pipeline.yml with empty pipeline array falls back to hardcoded', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-empty-pipeline-');
  const aloopDir = path.join(root, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'pipeline.yml'), `
pipeline: []
  `, 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_qa.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — pipeline.yml with non-plan entries only falls back to hardcoded', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-no-agent-pipeline-');
  const aloopDir = path.join(root, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'pipeline.yml'), `
pipeline:
  - repeat: 2
  `, 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_qa.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — round-robin plan-build with empty roundRobinOrder uses default', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-rr-empty-');
  const plan = await compileLoopPlan({
    mode: 'plan-build',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: [],
    roundRobinOrder: [],
    models: {},
  });

  assert.equal(plan.cycle.length, 2);
  assert.equal(plan.cycle[0], 'PROMPT_plan.md');
  assert.equal(plan.cycle[1], 'PROMPT_build_claude.md');
});

test('compileLoopPlan — round-robin plan mode uses early return', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-rr-plan-');
  const plan = await compileLoopPlan({
    mode: 'plan',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  assert.deepStrictEqual(plan.cycle, ['PROMPT_plan.md']);
});

test('compileLoopPlan — round-robin build mode uses early return', async () => {
  const { promptsDir, sessionDir } = await setupDirs('clp-rr-build-');
  const plan = await compileLoopPlan({
    mode: 'build',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  });

  assert.deepStrictEqual(plan.cycle, ['PROMPT_build.md']);
});

test('compileLoopPlan — round-robin plan-build-review with no pipeline falls back to plan-build-qa-review', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-rr-no-pipeline-');
  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'round-robin',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude', 'codex'],
    roundRobinOrder: ['claude', 'codex'],
    models: { claude: 'opus', codex: 'gpt-5' },
    projectRoot: root,
  });

  assert.equal(plan.cycle.length, 5);
  assert.equal(plan.cycle[0], 'PROMPT_plan.md');
  assert.equal(plan.cycle[1], 'PROMPT_build_claude.md');
  assert.equal(plan.cycle[2], 'PROMPT_build_codex.md');
  assert.equal(plan.cycle[3], 'PROMPT_qa.md');
  assert.equal(plan.cycle[4], 'PROMPT_review.md');
});

test('compileLoopPlan — pipeline.yml with non-array pipeline falls back to hardcoded', async () => {
  const { root, promptsDir, sessionDir } = await setupDirs('clp-nonarray-pipeline-');
  const aloopDir = path.join(root, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  await writeFile(path.join(aloopDir, 'pipeline.yml'), `
pipeline: "not an array"
  `, 'utf8');

  const plan = await compileLoopPlan({
    mode: 'plan-build-review',
    provider: 'claude',
    promptsDir,
    sessionDir,
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
    projectRoot: root,
  });

  assert.deepStrictEqual(plan.cycle, [
    'PROMPT_plan.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_build.md',
    'PROMPT_qa.md',
    'PROMPT_review.md',
  ]);
});

test('compileLoopPlan — uses deps for file I/O', async () => {
  const files: Record<string, string> = {
    '/prompts/PROMPT_build.md': '# Build\n',
  };
  const written: Record<string, string> = {};

  const deps = {
    readFile: async (p: string) => {
      if (files[p]) return files[p];
      throw new Error(`File not found: ${p}`);
    },
    writeFile: async (p: string, data: string) => {
      written[p] = data;
    },
    existsSync: (p: string) => p in files,
  };

  const plan = await compileLoopPlan({
    mode: 'build',
    provider: 'claude',
    promptsDir: '/prompts',
    sessionDir: '/session',
    enabledProviders: ['claude'],
    roundRobinOrder: ['claude'],
    models: { claude: 'opus' },
  }, deps);

  assert.deepStrictEqual(plan.cycle, ['PROMPT_build.md']);
  assert.ok('/session/loop-plan.json' in written, 'should write loop-plan.json via deps');
  assert.ok('/prompts/PROMPT_build.md' in written, 'should write frontmatter via deps');
});
