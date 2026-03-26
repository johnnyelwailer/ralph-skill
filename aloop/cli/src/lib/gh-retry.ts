/**
 * Retry and rate-limit handling for `gh` CLI calls.
 *
 * Provides exponential backoff with jitter for transient GitHub API errors,
 * including primary/secondary rate limits, abuse detection, and network timeouts.
 */

export interface GhExecResult {
  stdout: string;
  stderr: string;
}

export type GhExecFn = (args: string[]) => Promise<GhExecResult>;

export interface GhRetryOptions {
  /** Maximum number of retries after the initial attempt. Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay in ms between retries. Default: 60000 */
  maxDelayMs?: number;
  /** Called before each retry with attempt number (1-indexed) and delay. */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  /** Optional sleep function (injectable for tests). Default: setTimeout-based */
  sleep?: (ms: number) => Promise<void>;
}

/** Patterns in error message/stderr that indicate a retryable rate limit. */
const RATE_LIMIT_PATTERNS = [
  /rate[\s-]?limit/i,
  /\b429\b/,
  /secondary[\s-]?rate[\s-]?limit/i,
  /too[\s-]?many[\s-]?requests/i,
  /retry[\s-]?after/i,
  /abuse[\s-]?detection/i,
  /\b403\b.*rate/i,
  /rate.*\b403\b/i,
];

/** Patterns that indicate a transient network/server error worth retrying. */
const TRANSIENT_PATTERNS = [
  /network/i,
  /timeout/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /socket[\s-]?hang[\s-]?up/i,
  /\b50[0-4]\b/,
  /internal[\s-]?server[\s-]?error/i,
  /bad[\s-]?gateway/i,
  /service[\s-]?unavailable/i,
  /gateway[\s-]?timeout/i,
];

function extractErrorText(error: unknown): string {
  const parts: string[] = [];
  if (error && typeof error === 'object') {
    const maybeStderr = (error as { stderr?: unknown }).stderr;
    if (typeof maybeStderr === 'string' && maybeStderr.trim()) {
      parts.push(maybeStderr);
    }
    const maybeStdout = (error as { stdout?: unknown }).stdout;
    if (typeof maybeStdout === 'string' && maybeStdout.trim()) {
      parts.push(maybeStdout);
    }
    const maybeMsg = (error as { message?: unknown }).message;
    if (typeof maybeMsg === 'string' && maybeMsg.trim()) {
      parts.push(maybeMsg);
    }
  }
  return parts.join('\n');
}

/**
 * Check if an error from `gh` CLI indicates a GitHub rate limit.
 */
export function isRateLimitError(error: unknown): boolean {
  const text = extractErrorText(error);
  return RATE_LIMIT_PATTERNS.some((p) => p.test(text));
}

/**
 * Check if an error from `gh` CLI is transient and worth retrying.
 * Returns true for rate limits, network errors, and server errors.
 */
export function isRetryableError(error: unknown): boolean {
  const text = extractErrorText(error);
  return (
    RATE_LIMIT_PATTERNS.some((p) => p.test(text)) ||
    TRANSIENT_PATTERNS.some((p) => p.test(text))
  );
}

/**
 * Extract Retry-After seconds from error text, if present.
 * GitHub sometimes includes `Retry-After: <seconds>` in responses.
 */
export function extractRetryAfterSeconds(error: unknown): number | null {
  const text = extractErrorText(error);
  const match = text.match(/retry[\s-]?after[:\s]+(\d+)/i);
  if (match) {
    const secs = Number.parseInt(match[1], 10);
    if (Number.isFinite(secs) && secs > 0) return secs;
  }
  return null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter.
 * Formula: min(maxDelay, baseDelay * 2^(attempt-1)) * (0.5 + random * 0.5)
 */
export function calculateBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.round(jitter);
}

/**
 * Wrap a `gh` CLI executor function with retry + exponential backoff.
 *
 * Only retries for transient errors (rate limits, network failures, server errors).
 * Non-transient errors (auth failures, bad arguments, PATH hardening) are thrown immediately.
 */
export function withGhRetry(
  exec: GhExecFn,
  options: GhRetryOptions = {},
): GhExecFn {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    onRetry,
    sleep = defaultSleep,
  } = options;

  if (maxRetries <= 0) return exec;

  return async function execWithRetry(args: string[]): Promise<GhExecResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await exec(args);
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries || !isRetryableError(error)) {
          throw error;
        }
        // Use Retry-After header if present, otherwise exponential backoff
        const retryAfterSecs = extractRetryAfterSeconds(error);
        const delayMs = retryAfterSecs != null
          ? Math.min(retryAfterSecs * 1000, maxDelayMs)
          : calculateBackoffMs(attempt + 1, baseDelayMs, maxDelayMs);
        onRetry?.(attempt + 1, delayMs, error);
        await sleep(delayMs);
      }
    }
    throw lastError;
  };
}
