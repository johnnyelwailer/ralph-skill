import { test } from 'node:test';
import * as assert from 'node:assert';
import { writeSpecBackfill } from './specBackfill.js';

test('writeSpecBackfill - replaces content between matching section header and next header', async () => {
  const files: Record<string, string> = {
    '/project/SPEC.md': '# Spec\n\n## Requirements\n\nOld content.\n\n## Design\n\nDesign stuff.',
  };
  const gitCalls: string[][] = [];

  const result = await writeSpecBackfill({
    specFile: 'SPEC.md',
    section: 'Requirements',
    content: 'New content.',
    sessionId: 'sess-1',
    iteration: 3,
    projectRoot: '/project',
    deps: {
      readFile: async (p) => files[p] ?? '',
      writeFile: async (p, d) => { files[p] = d; },
      execGit: async (args) => { gitCalls.push(args); return { stdout: '', stderr: '' }; },
    },
  });

  assert.equal(result, true);
  const updated = files['/project/SPEC.md'];
  assert.ok(updated.includes('New content.'));
  assert.ok(!updated.includes('Old content.'));
  assert.ok(updated.includes('## Requirements'));
  assert.ok(updated.includes('## Design'));
  assert.ok(gitCalls.some(args => args.includes('commit')));
  const commitArgs = gitCalls.find(args => args.includes('commit'));
  const commitMsg = commitArgs![commitArgs!.indexOf('-m') + 1];
  assert.ok(commitMsg.includes('Aloop-Agent: spec-backfill'));
  assert.ok(commitMsg.includes('Aloop-Iteration: 3'));
  assert.ok(commitMsg.includes('Aloop-Session: sess-1'));
});

test('writeSpecBackfill - appends new section when header not found', async () => {
  const files: Record<string, string> = {
    '/project/SPEC.md': '# Spec\n\n## Existing\nContent here',
  };

  const result = await writeSpecBackfill({
    specFile: 'SPEC.md',
    section: 'New Section',
    content: 'Brand new content',
    sessionId: 'sess-2',
    iteration: 1,
    projectRoot: '/project',
    deps: {
      readFile: async (p) => files[p] ?? '',
      writeFile: async (p, d) => { files[p] = d; },
    },
  });

  assert.equal(result, true);
  const updated = files['/project/SPEC.md'];
  assert.ok(updated.includes('## New Section'));
  assert.ok(updated.includes('Brand new content'));
  assert.ok(updated.includes('## Existing'));
});

test('writeSpecBackfill - returns false on read error', async () => {
  const result = await writeSpecBackfill({
    specFile: 'SPEC.md',
    section: 'Section',
    content: 'Content.',
    sessionId: 'sess-3',
    iteration: 1,
    projectRoot: '/project',
    deps: {
      readFile: async () => { throw new Error('not found'); },
      writeFile: async () => {},
    },
  });

  assert.equal(result, false);
});

test('writeSpecBackfill - works without execGit (no git commit)', async () => {
  const files: Record<string, string> = {
    '/project/SPEC.md': '# Spec\n\n## Section\n\nOld',
  };

  const result = await writeSpecBackfill({
    specFile: 'SPEC.md',
    section: 'Section',
    content: 'New',
    sessionId: 'sess-4',
    iteration: 1,
    projectRoot: '/project',
    deps: {
      readFile: async (p) => files[p] ?? '',
      writeFile: async (p, d) => { files[p] = d; },
    },
  });

  assert.equal(result, true);
  assert.ok(files['/project/SPEC.md'].includes('New'));
});
