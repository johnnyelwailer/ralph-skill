import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type OpType =
  | 'issue_edit' | 'issue_create' | 'pr_create' | 'pr_merge'
  | 'project_status' | 'post_comment' | 'tasklist_update';

export type ErrorType = 'rate_limit' | 'auth' | 'network' | 'unknown';

export interface PendingSyncEntry {
  id: string;
  op: OpType;
  args: Record<string, unknown>;
  enqueued_at: string;
  attempt_count: number;
  last_error: string | null;
  error_type: ErrorType | null;
}

export interface PendingSyncConfig {
  max_queue_depth: number;
  max_retry_attempts: number;
  flush_batch_size: number;
}

export interface FlushResult {
  succeeded: string[];
  failed: string[];
  skipped: string[];
}

export const DEFAULT_PENDING_SYNC_CONFIG: PendingSyncConfig = {
  max_queue_depth: 100,
  max_retry_attempts: 5,
  flush_batch_size: 10,
};

export type FlushExecutor = (entry: PendingSyncEntry) => Promise<{ error: string; error_type: ErrorType } | null>;
export type IdempotencyCheck = (entry: PendingSyncEntry) => Promise<number | null>;

export class PendingSyncQueue {
  private entries: PendingSyncEntry[] = [];
  readonly filePath: string;
  readonly config: PendingSyncConfig;

  constructor(sessionDir: string, config: Partial<PendingSyncConfig> = {}) {
    this.filePath = path.join(sessionDir, 'pending-sync.json');
    this.config = { ...DEFAULT_PENDING_SYNC_CONFIG, ...config };
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed.version === 1 && Array.isArray(parsed.entries)) {
        this.entries = parsed.entries as PendingSyncEntry[];
      }
    } catch { /* corrupt file — start fresh */ }
  }

  async save(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify({ version: 1, entries: this.entries }, null, 2), 'utf8');
  }

  enqueue(op: OpType, args: Record<string, unknown>): PendingSyncEntry | null {
    if (this.entries.length >= this.config.max_queue_depth) {
      console.warn(`[pending-sync] Queue full (depth=${this.config.max_queue_depth}), dropping: ${op}`);
      return null;
    }
    const entry: PendingSyncEntry = {
      id: randomUUID(), op, args,
      enqueued_at: new Date().toISOString(),
      attempt_count: 0, last_error: null, error_type: null,
    };
    this.entries.push(entry);
    return entry;
  }

  get pendingCount(): number { return this.entries.length; }

  getEntries(): readonly PendingSyncEntry[] { return this.entries; }

  async flush(executor: FlushExecutor, idempotencyCheck?: IdempotencyCheck): Promise<FlushResult> {
    const result: FlushResult = { succeeded: [], failed: [], skipped: [] };
    const eligible = this.entries
      .filter(e => e.error_type !== 'auth' && e.attempt_count < this.config.max_retry_attempts)
      .slice(0, this.config.flush_batch_size);

    for (const entry of eligible) {
      if (idempotencyCheck && (entry.op === 'issue_create' || entry.op === 'pr_create')) {
        try {
          const existingNum = await idempotencyCheck(entry);
          if (existingNum !== null) {
            this.entries = this.entries.filter(e => e.id !== entry.id);
            result.skipped.push(entry.id);
            continue;
          }
        } catch { /* check failed — proceed */ }
      }

      entry.attempt_count++;
      let outcome: { error: string; error_type: ErrorType } | null = null;
      try {
        outcome = await executor(entry);
      } catch (e) {
        outcome = { error: String(e), error_type: classifyError(String(e)) };
      }

      if (outcome === null) {
        this.entries = this.entries.filter(e => e.id !== entry.id);
        result.succeeded.push(entry.id);
      } else {
        entry.last_error = outcome.error;
        entry.error_type = outcome.error_type;
        result.failed.push(entry.id);
      }
    }

    return result;
  }
}

export function classifyError(message: string): ErrorType {
  const lower = message.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('secondary rate')) return 'rate_limit';
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('authentication') || lower.includes('bad credentials')) return 'auth';
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('etimedout') || lower.includes('network') || lower.includes('socket')) return 'network';
  return 'unknown';
}
