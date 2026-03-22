import test from 'node:test';
import assert from 'node:assert/strict';
import { withErrorHandling } from './error-handling.js';

test('withErrorHandling outputs JSON when options.output is json', async (t) => {
  const logs: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  const handler = withErrorHandling(async () => {
    throw new Error('something broke');
  });

  await assert.rejects(() => handler({ output: 'json' }), /process\.exit:1/);
  assert.equal(logs.length, 1);
  const payload = JSON.parse(logs[0]) as { success: boolean; error: string };
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'something broke');
});

test('withErrorHandling outputs plain text when options.output is text', async (t) => {
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => errors.push(args.join(' ')));
  t.mock.method(console, 'log', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  const handler = withErrorHandling(async () => {
    throw new Error('something broke');
  });

  await assert.rejects(() => handler({ output: 'text' }), /process\.exit:1/);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Error: something broke/);
});

test('withErrorHandling outputs plain text when no output option', async (t) => {
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => errors.push(args.join(' ')));
  t.mock.method(console, 'log', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  const handler = withErrorHandling(async () => {
    throw new Error('no output flag');
  });

  await assert.rejects(() => handler({}), /process\.exit:1/);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Error: no output flag/);
});

test('withErrorHandling outputs JSON for stderr errors when output is json', async (t) => {
  const logs: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => logs.push(args.join(' ')));
  t.mock.method(console, 'error', () => {});
  t.mock.method(process, 'exit', ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit:${String(code ?? '')}`);
  }) as typeof process.exit);

  const handler = withErrorHandling(async () => {
    throw Object.assign(new Error('cmd failed'), { stderr: 'gh: not found\n' });
  });

  await assert.rejects(() => handler({ output: 'json' }), /process\.exit:1/);
  assert.equal(logs.length, 1);
  const payload = JSON.parse(logs[0]) as { success: boolean; error: string };
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'gh: not found');
});
