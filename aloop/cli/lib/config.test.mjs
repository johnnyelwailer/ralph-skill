import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { parseSimpleYaml, readYamlFile } from './config.mjs';

test('parseSimpleYaml supports scalars, lists, and block strings', () => {
  const parsed = parseSimpleYaml([
    "default_provider: 'gemini'",
    'max_iterations: 50',
    'enabled_providers:',
    "  - 'claude'",
    "  - 'codex'",
    'validation_commands: |',
    '  npm test',
    '  npm run lint',
    '',
  ].join('\n'));

  assert.equal(parsed.default_provider, 'gemini');
  assert.equal(parsed.max_iterations, 50);
  assert.deepEqual(parsed.enabled_providers, ['claude', 'codex']);
  assert.equal(parsed.validation_commands, 'npm test\nnpm run lint');
});

test('parseSimpleYaml: double-quoted string', () => {
  const parsed = parseSimpleYaml('key: "hello world"');
  assert.equal(parsed.key, 'hello world');
});

test('parseSimpleYaml: single-quoted string with escaped quote', () => {
  const parsed = parseSimpleYaml("key: 'it''s here'");
  assert.equal(parsed.key, "it's here");
});

test('parseSimpleYaml: boolean true and false', () => {
  const parsed = parseSimpleYaml('a: true\nb: false');
  assert.equal(parsed.a, true);
  assert.equal(parsed.b, false);
});

test('parseSimpleYaml: null value', () => {
  const parsed = parseSimpleYaml('key: null');
  assert.equal(parsed.key, null);
});

test('parseSimpleYaml: integer numbers', () => {
  const parsed = parseSimpleYaml('pos: 42\nneg: -7');
  assert.equal(parsed.pos, 42);
  assert.equal(parsed.neg, -7);
});

test('parseSimpleYaml: empty list (key with no indented items)', () => {
  const parsed = parseSimpleYaml('items:\nnext_key: value');
  assert.equal(parsed.items, '');
  assert.equal(parsed.next_key, 'value');
});

test('parseSimpleYaml: block string with | preserves newlines', () => {
  const content = ['script: |', '  line one', '  line two', ''].join('\n');
  const parsed = parseSimpleYaml(content);
  assert.equal(parsed.script, 'line one\nline two');
});

test('parseSimpleYaml: malformed line (no colon) is skipped', () => {
  const parsed = parseSimpleYaml('not a key value\nreal_key: real_value');
  assert.equal(parsed.real_key, 'real_value');
  assert.equal(Object.keys(parsed).length, 1);
});

test('parseSimpleYaml: comment lines are ignored', () => {
  const parsed = parseSimpleYaml('# this is a comment\nkey: value');
  assert.equal(parsed.key, 'value');
  assert.equal(Object.keys(parsed).length, 1);
});

test('parseSimpleYaml: indented top-level lines are skipped', () => {
  const parsed = parseSimpleYaml('  indented: skipped\nkey: value');
  assert.equal(parsed.key, 'value');
  assert.ok(!('indented' in parsed));
});

test('parseSimpleYaml: list items with mixed scalars', () => {
  const content = ['mixed:', '  - true', '  - 42', '  - hello'].join('\n');
  const parsed = parseSimpleYaml(content);
  assert.deepEqual(parsed.mixed, [true, 42, 'hello']);
});

test('readYamlFile: returns null for missing file', async () => {
  const result = await readYamlFile('/nonexistent/path/config.yml');
  assert.equal(result, null);
});

test('readYamlFile: parses an actual file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  const filePath = path.join(dir, 'config.yml');
  await writeFile(filePath, 'provider: gemini\ncount: 3\n', 'utf8');
  const result = await readYamlFile(filePath);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.count, 3);
});
