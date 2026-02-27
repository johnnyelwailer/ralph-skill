import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSimpleYaml } from './config.mjs';

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
