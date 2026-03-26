/**
 * Centralized retry and rate-limit handling for GitHub CLI calls.
 *
 * Wraps gh CLI execution with exponential backoff on rate-limit errors
 * (HTTP 429, secondary rate limits, primary rate limits).
 */

// --- Rate-limit detection ---

const RATE_LIMIT_PATTERNS = [
  /api rate limit exceeded/i,
  /rate limit/i,
  /429/,
  /too many requests/i,
  /secondary rate limit/i,
  /abuse detection/i,
  /exceeded a secondary rate limit/i,
  /you have exceeded a secondary rate limit/i,
  /please wait a few minutes/i,
  /x-ratelimit-remaining.*0/i,
];

const AUTH_ERROR_PATTERNS = [
  /authentication required/i,
  /bad credentials/i,
  /401/,
  /token.*expired/i,
  /not logged in/i,
  /gh auth/i,
];

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /network/i,
  /econnreset/i,
  /econnrefused/i,
  /socket hang up/i,
  /500/,
  /502/,
  /503/,
  /504/,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway timeout/i,
];

export type GhErrorKind = 'rate_limit' | 'auth' | 'transient' | 'other';

/**
 * Classify a gh CLI error based on exit code, stderr, and stdout.
 */
export function classifyGhError(error: {
  stderr?: string;
  stdout?: string;
  message?: string;
  status?: number | null;
}): GhErrorKind {
  const text = [error.stderr, error.stdout, error.message].filter(Boolean).join('\n');

  for (const pattern of AUTH_ERROR_PATTERNS) {
    if (pattern.test(text)) return 'auth';
  }

  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (pattern.test(text)) return 'rate_limit';
  }

  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(text)) return 'transient';
  }

  return 'other';
}

/**
 * Returns true if the error is retryable (rate limit or transient).
 */
export function isRetryableError(error: {
  stderr?: string;
  stdout?: string;
  message?: string;
  status?: number | null;
}): boolean {
  const kind = classifyGhError(error);
  return kind === 'rate_limit' || kind === 'transient';
}

// --- Retry logic ---

export interface GhRetryOptions {
  /** Maximum number of retry attempts (not counting the initial call). Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 2000 */
  baseDelayMs?: number;
  /** Maximum delay in ms between retries. Default: 60000 */
  maxDelayMs?: number;
  /** Custom predicate to decide if an error should be retried. Default: rate_limit + transient */
  shouldRetry?: (error: { stderr: string; stdout: string; message: string }) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute exponential backoff delay with jitter.
 *
 * Formula: min(baseDelay * 2^attempt + random_jitter, maxDelay)
 * Jitter: random value in [0, baseDelay * 0.5)
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs * 0.5;
  return Math.min(exponential + jitter, maxDelayMs);
}

export interface GhExecResult {
  stdout: string;
  stderr: string;
}

export type GhExecFn = (args: string[]) => Promise<GhExecResult>;

/**
 * Execute a gh CLI command with retry on rate-limit and transient errors.
 *
 * Uses exponential backoff with jitter between retry attempts.
 * Auth errors are NOT retried (they require user action).
 *
 * @param execGh - The underlying gh executor function
 * @param args - Arguments to pass to `gh`
 * @param options - Retry configuration
 * @returns The result of the gh call
 * @throws The last error if all retries are exhausted
 */
export async function execGhWithRetry(
  execGh: GhExecFn,
  args: string[],
  options: GhRetryOptions = {},
): Promise<GhExecResult> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = options.shouldRetry ?? ((err) => isRetryableError(err));

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await execGh(args);
    } catch (error) {
      const stderr = typeof (error as any)?.stderr === 'string' ? (error as any).stderr : '';
      const stdout = typeof (error as any)?.stdout === 'string' ? (error as any).stdout : '';
      const message = error instanceof Error ? error.message : String(error);

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxRetries) {
        break;
      }

      if (!shouldRetry({ stderr, stdout, message })) {
        throw error;
      }

      const delay = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      const kind = classifyGhError({ stderr, stdout, message });
      console.warn(
        `[gh-retry] ${kind} error on attempt ${attempt + 1}/${maxRetries + 1}, ` +
        `retrying in ${Math.round(delay)}ms: ${message.substring(0, 100)}`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wrap a gh executor function with automatic retry logic.
 *
 * Returns a new function that has the same signature but retries
 * on rate-limit and transient errors.
 *
 * @example
 * const execGh = wrapGhWithRetry(ghExecutor.exec);
 * await execGh(['pr', 'view', '123']);
 */
export function wrapGhWithRetry(
  execGh: GhExecFn,
  options: GhRetryOptions = {},
): GhExecFn {
  return (args: string[]) => execGhWithRetry(execGh, args, options);
}
