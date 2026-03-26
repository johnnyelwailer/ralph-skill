import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  withGhRetry,
  isRateLimitError,
  isRetryableError,
  extractRetryAfterSeconds,
  calculateBackoffMs,
  type GhExecFn,
  type GhExecResult,
} from './gh-retry.js';

// --- isRateLimitError ---

describe('isRateLimitError', () => {
  it('detects "rate limit" in stderr', () => {
    assert.ok(isRateLimitError({ stderr: 'API rate limit exceeded for user' }));
  });

  it('detects 429 status code', () => {
    assert.ok(isRateLimitError({ message: 'HTTP 429 Too Many Requests' }));
  });

  it('detects secondary rate limit', () => {
    assert.ok(isRateLimitError({ stderr: 'secondary rate limit exceeded' }));
  });

  it('detects abuse detection', () => {
    assert.ok(isRateLimitError({ stderr: 'abuse detection triggered' }));
  });

  it('detects 403 + rate pattern', () => {
    assert.ok(isRateLimitError({ stderr: '403 rate limit violation' }));
  });

  it('detects retry-after header', () => {
    assert.ok(isRateLimitError({ stderr: 'retry-after: 60' }));
  });

  it('returns false for non-rate-limit errors', () => {
    assert.ok(!isRateLimitError({ stderr: 'not found' }));
    assert.ok(!isRateLimitError({ message: 'authentication failed' }));
    assert.ok(!isRateLimitError(null));
    assert.ok(!isRateLimitError(undefined));
  });
});

// --- isRetryableError ---

describe('isRetryableError', () => {
  it('returns true for rate limit errors', () => {
    assert.ok(isRetryableError({ stderr: 'rate limit exceeded' }));
  });

  it('returns true for network errors', () => {
    assert.ok(isRetryableError({ message: 'network timeout' }));
  });

  it('returns true for ECONNRESET', () => {
    assert.ok(isRetryableError({ message: 'ECONNRESET' }));
  });

  it('returns true for server errors (5xx)', () => {
    assert.ok(isRetryableError({ stderr: 'HTTP 502 Bad Gateway' }));
    assert.ok(isRetryableError({ stderr: 'HTTP 503 Service Unavailable' }));
  });

  it('returns true for socket hang up', () => {
    assert.ok(isRetryableError({ message: 'socket hang up' }));
  });

  it('returns false for auth errors', () => {
    assert.ok(!isRetryableError({ stderr: 'authentication required' }));
  });

  it('returns false for not found', () => {
    assert.ok(!isRetryableError({ message: 'not found' }));
  });

  it('returns false for null/undefined', () => {
    assert.ok(!isRetryableError(null));
    assert.ok(!isRetryableError(undefined));
  });
});

// --- extractRetryAfterSeconds ---

describe('extractRetryAfterSeconds', () => {
  it('extracts seconds from stderr', () => {
    assert.equal(extractRetryAfterSeconds({ stderr: 'retry-after: 60' }), 60);
  });

  it('extracts from message', () => {
    assert.equal(extractRetryAfterSeconds({ message: 'Retry-After: 120' }), 120);
  });

  it('returns null when no retry-after header', () => {
    assert.equal(extractRetryAfterSeconds({ stderr: 'rate limit exceeded' }), null);
  });

  it('returns null for invalid values', () => {
    assert.equal(extractRetryAfterSeconds({ stderr: 'retry-after: abc' }), null);
  });
});

// --- calculateBackoffMs ---

describe('calculateBackoffMs', () => {
  it('increases exponentially with attempt number', () => {
    // With jitter, the result should be in range [0.5 * base * 2^(n-1), base * 2^(n-1)]
    const baseDelay = 1000;
    const maxDelay = 60000;

    // Run multiple times to account for jitter
    for (let i = 0; i < 10; i++) {
      const delay1 = calculateBackoffMs(1, baseDelay, maxDelay);
      const delay2 = calculateBackoffMs(2, baseDelay, maxDelay);
      const delay3 = calculateBackoffMs(3, baseDelay, maxDelay);

      // Attempt 1: range [500, 1000]
      assert.ok(delay1 >= 500 && delay1 <= 1000, `attempt 1: ${delay1} not in [500, 1000]`);
      // Attempt 2: range [1000, 2000]
      assert.ok(delay2 >= 1000 && delay2 <= 2000, `attempt 2: ${delay2} not in [1000, 2000]`);
      // Attempt 3: range [2000, 4000]
      assert.ok(delay3 >= 2000 && delay3 <= 4000, `attempt 3: ${delay3} not in [2000, 4000]`);
    }
  });

  it('caps at maxDelay', () => {
    const baseDelay = 1000;
    const maxDelay = 5000;
    // Attempt 10: 1000 * 2^9 = 512000, capped to 5000
    const delay = calculateBackoffMs(10, baseDelay, maxDelay);
    assert.ok(delay >= 2500 && delay <= 5000, `${delay} not in [2500, 5000]`);
  });
});

// --- withGhRetry ---

describe('withGhRetry', () => {
  it('returns result immediately on success', async () => {
    const exec: GhExecFn = async () => ({ stdout: 'ok', stderr: '' });
    const wrapped = withGhRetry(exec);
    const result = await wrapped(['pr', 'view']);
    assert.equal(result.stdout, 'ok');
  });

  it('does not retry non-transient errors', async () => {
    let calls = 0;
    const exec: GhExecFn = async () => {
      calls++;
      throw new Error('not found');
    };
    const wrapped = withGhRetry(exec, { maxRetries: 3 });
    await assert.rejects(() => wrapped(['pr', 'view']), { message: 'not found' });
    assert.equal(calls, 1);
  });

  it('retries rate limit errors with backoff', async () => {
    let calls = 0;
    const delays: number[] = [];
    const exec: GhExecFn = async () => {
      calls++;
      if (calls < 3) {
        throw new Error('API rate limit exceeded');
      }
      return { stdout: 'success', stderr: '' };
    };
    const wrapped = withGhRetry(exec, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      onRetry: (attempt, delay) => { delays.push(delay); },
      sleep: async () => {},
    });
    const result = await wrapped(['pr', 'view']);
    assert.equal(result.stdout, 'success');
    assert.equal(calls, 3);
    assert.equal(delays.length, 2);
  });

  it('retries network errors', async () => {
    let calls = 0;
    const exec: GhExecFn = async () => {
      calls++;
      if (calls < 2) {
        throw new Error('ECONNRESET');
      }
      return { stdout: 'ok', stderr: '' };
    };
    const wrapped = withGhRetry(exec, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, sleep: async () => {} });
    const result = await wrapped(['pr', 'view']);
    assert.equal(result.stdout, 'ok');
    assert.equal(calls, 2);
  });

  it('gives up after maxRetries', async () => {
    let calls = 0;
    const exec: GhExecFn = async () => {
      calls++;
      throw new Error('rate limit exceeded');
    };
    const wrapped = withGhRetry(exec, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10, sleep: async () => {} });
    await assert.rejects(() => wrapped(['pr', 'view']), { message: 'rate limit exceeded' });
    assert.equal(calls, 3); // 1 initial + 2 retries
  });

  it('respects Retry-After header over exponential backoff', async () => {
    let calls = 0;
    const delays: number[] = [];
    const exec: GhExecFn = async () => {
      calls++;
      if (calls < 2) {
        throw new Error('rate limit exceeded. retry-after: 5');
      }
      return { stdout: 'ok', stderr: '' };
    };
    const wrapped = withGhRetry(exec, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 10000,
      onRetry: (_attempt, delay) => { delays.push(delay); },
      sleep: async () => {},
    });
    await wrapped(['pr', 'view']);
    assert.equal(delays[0], 5000); // 5 seconds * 1000
  });

  it('caps Retry-After at maxDelayMs', async () => {
    let calls = 0;
    const delays: number[] = [];
    const exec: GhExecFn = async () => {
      calls++;
      if (calls < 2) {
        throw new Error('retry-after: 300');
      }
      return { stdout: 'ok', stderr: '' };
    };
    const wrapped = withGhRetry(exec, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 10000,
      onRetry: (_attempt, delay) => { delays.push(delay); },
      sleep: async () => {},
    });
    await wrapped(['pr', 'view']);
    assert.equal(delays[0], 10000); // capped at maxDelayMs
  });

  it('returns original executor when maxRetries <= 0', async () => {
    const exec: GhExecFn = async () => ({ stdout: 'direct', stderr: '' });
    const wrapped = withGhRetry(exec, { maxRetries: 0 });
    assert.equal(wrapped, exec);
  });

  it('uses injectable sleep for tests', async () => {
    let calls = 0;
    let sleepCalls = 0;
    const exec: GhExecFn = async () => {
      calls++;
      if (calls < 3) throw new Error('429 Too Many Requests');
      return { stdout: 'ok', stderr: '' };
    };
    const wrapped = withGhRetry(exec, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      sleep: async () => { sleepCalls++; },
    });
    await wrapped(['pr', 'view']);
    assert.equal(calls, 3);
    assert.equal(sleepCalls, 2);
  });

  it('passes args through to underlying executor', async () => {
    const receivedArgs: string[][] = [];
    const exec: GhExecFn = async (args) => {
      receivedArgs.push(args);
      return { stdout: 'ok', stderr: '' };
    };
    const wrapped = withGhRetry(exec, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    await wrapped(['pr', 'view', '123', '--repo', 'owner/repo']);
    assert.deepEqual(receivedArgs[0], ['pr', 'view', '123', '--repo', 'owner/repo']);
  });

  it('handles stderr as fallback error source', async () => {
    let calls = 0;
    const exec: GhExecFn = async () => {
      calls++;
      if (calls < 2) {
        throw { stderr: 'secondary rate limit exceeded', stdout: '', message: '' };
      }
      return { stdout: 'ok', stderr: '' };
    };
    const wrapped = withGhRetry(exec, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, sleep: async () => {} });
    const result = await wrapped(['pr', 'view']);
    assert.equal(result.stdout, 'ok');
    assert.equal(calls, 2);
  });
});
