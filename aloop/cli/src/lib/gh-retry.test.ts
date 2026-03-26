import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyGhError,
  isRetryableError,
  computeBackoffDelay,
  execGhWithRetry,
  wrapGhWithRetry,
  type GhExecFn,
} from './gh-retry.js';

describe('classifyGhError', () => {
  it('classifies rate limit errors', () => {
    assert.equal(classifyGhError({ stderr: 'API rate limit exceeded' }), 'rate_limit');
    assert.equal(classifyGhError({ stderr: 'error: 429 Too Many Requests' }), 'rate_limit');
    assert.equal(classifyGhError({ stderr: 'You have exceeded a secondary rate limit' }), 'rate_limit');
    assert.equal(classifyGhError({ message: 'rate limit reached' }), 'rate_limit');
    assert.equal(classifyGhError({ message: 'Please wait a few minutes before you try again' }), 'rate_limit');
  });

  it('classifies auth errors', () => {
    assert.equal(classifyGhError({ stderr: 'authentication required' }), 'auth');
    assert.equal(classifyGhError({ stderr: 'Bad credentials' }), 'auth');
    assert.equal(classifyGhError({ message: '401 Unauthorized' }), 'auth');
    assert.equal(classifyGhError({ message: 'gh auth login' }), 'auth');
  });

  it('classifies transient errors', () => {
    assert.equal(classifyGhError({ message: 'Connection timed out' }), 'transient');
    assert.equal(classifyGhError({ stderr: '503 Service Unavailable' }), 'transient');
    assert.equal(classifyGhError({ message: 'ECONNRESET' }), 'transient');
    assert.equal(classifyGhError({ message: 'socket hang up' }), 'transient');
  });

  it('classifies unknown errors as other', () => {
    assert.equal(classifyGhError({ stderr: 'some random error' }), 'other');
    assert.equal(classifyGhError({ message: 'file not found' }), 'other');
    assert.equal(classifyGhError({}), 'other');
  });
});

describe('isRetryableError', () => {
  it('returns true for rate_limit and transient', () => {
    assert.ok(isRetryableError({ stderr: 'rate limit exceeded' }));
    assert.ok(isRetryableError({ message: 'timeout' }));
  });

  it('returns false for auth and other', () => {
    assert.ok(!isRetryableError({ stderr: 'Bad credentials' }));
    assert.ok(!isRetryableError({ message: 'file not found' }));
  });
});

describe('computeBackoffDelay', () => {
  it('increases exponentially with attempt', () => {
    const d0 = computeBackoffDelay(0, 1000, 60000);
    const d1 = computeBackoffDelay(1, 1000, 60000);
    const d2 = computeBackoffDelay(2, 1000, 60000);

    // Each should be roughly double the previous (with jitter)
    assert.ok(d0 >= 1000 && d0 <= 1500);
    assert.ok(d1 >= 2000 && d1 <= 2500);
    assert.ok(d2 >= 4000 && d2 <= 4500);
  });

  it('caps at maxDelayMs', () => {
    const d = computeBackoffDelay(20, 1000, 5000);
    assert.ok(d <= 5500); // maxDelay + jitter
  });
});

describe('execGhWithRetry', () => {
  it('returns result on first success', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      return { stdout: '{"ok": true}', stderr: '' };
    };

    const result = await execGhWithRetry(execGh, ['pr', 'view', '1']);
    assert.equal(result.stdout, '{"ok": true}');
    assert.equal(callCount, 1);
  });

  it('retries on rate limit error and succeeds on retry', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      if (callCount < 3) {
        throw Object.assign(new Error('API rate limit exceeded'), {
          stderr: 'API rate limit exceeded',
          stdout: '',
        });
      }
      return { stdout: '{"ok": true}', stderr: '' };
    };

    const result = await execGhWithRetry(execGh, ['pr', 'view', '1'], {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
    });
    assert.equal(result.stdout, '{"ok": true}');
    assert.equal(callCount, 3);
  });

  it('does not retry on auth errors', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      throw Object.assign(new Error('Bad credentials'), {
        stderr: 'Bad credentials',
        stdout: '',
      });
    };

    await assert.rejects(
      () => execGhWithRetry(execGh, ['pr', 'view', '1'], { maxRetries: 3, baseDelayMs: 1 }),
      { message: 'Bad credentials' },
    );
    assert.equal(callCount, 1);
  });

  it('throws last error after exhausting retries', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      throw Object.assign(new Error('rate limit exceeded'), {
        stderr: 'rate limit exceeded',
        stdout: '',
      });
    };

    await assert.rejects(
      () => execGhWithRetry(execGh, ['pr', 'view', '1'], {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 2,
      }),
      { message: 'rate limit exceeded' },
    );
    assert.equal(callCount, 3); // 1 initial + 2 retries
  });

  it('retries on transient errors like 503', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      if (callCount < 2) {
        throw Object.assign(new Error('503 Service Unavailable'), {
          stderr: '503 Service Unavailable',
          stdout: '',
        });
      }
      return { stdout: '{"merged": true}', stderr: '' };
    };

    const result = await execGhWithRetry(execGh, ['pr', 'merge', '1'], {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 2,
    });
    assert.equal(result.stdout, '{"merged": true}');
    assert.equal(callCount, 2);
  });

  it('respects custom shouldRetry predicate', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      throw Object.assign(new Error('custom error'), {
        stderr: 'custom error',
        stdout: '',
      });
    };

    // Custom predicate that retries everything
    await assert.rejects(
      () => execGhWithRetry(execGh, ['pr', 'view', '1'], {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 2,
        shouldRetry: () => true,
      }),
      { message: 'custom error' },
    );
    assert.equal(callCount, 3);
  });
});

describe('wrapGhWithRetry', () => {
  it('wraps a function with retry semantics', async () => {
    let callCount = 0;
    const execGh: GhExecFn = async () => {
      callCount++;
      if (callCount < 2) {
        throw Object.assign(new Error('too many requests'), {
          stderr: 'too many requests',
          stdout: '',
        });
      }
      return { stdout: 'ok', stderr: '' };
    };

    const wrapped = wrapGhWithRetry(execGh, { baseDelayMs: 1, maxDelayMs: 2 });
    const result = await wrapped(['issue', 'list']);
    assert.equal(result.stdout, 'ok');
    assert.equal(callCount, 2);
  });
});
