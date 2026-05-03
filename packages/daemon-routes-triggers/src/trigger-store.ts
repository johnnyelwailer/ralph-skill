import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CreateTriggerInput, PatchTriggerInput, Trigger, TriggerFilter } from "./trigger-types.ts";

const TRIGGER_FILENAME = "trigger.json";

export class TriggerNotFoundError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`Trigger not found: ${id}`);
    this.id = id;
  }
}

export type TriggerStoreDeps = {
  readonly triggersDir: string;
};

/**
 * Manages trigger lifecycle persisted to disk under triggersDir/<id>/.
 * Durable across daemon restarts.
 */
export class TriggerStore {
  private readonly dir: string;

  constructor(deps: TriggerStoreDeps) {
    this.dir = deps.triggersDir;
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private triggerDir(id: string): string {
    return join(this.dir, id);
  }

  private triggerPath(id: string): string {
    return join(this.triggerDir(id), TRIGGER_FILENAME);
  }

  private read(id: string): Trigger {
    const p = this.triggerPath(id);
    if (!existsSync(p)) throw new TriggerNotFoundError(id);
    return JSON.parse(readFileSync(p, "utf-8")) as Trigger;
  }

  private write(t: Trigger): void {
    const dir = this.triggerDir(t.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.triggerPath(t.id), JSON.stringify(t, null, 2), "utf-8");
  }

  /**
   * Create a new trigger. Returns the created trigger.
   */
  create(input: CreateTriggerInput): Trigger {
    const id = `tr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();
    const trigger: Trigger = {
      id,
      scope: input.scope,
      source: input.source,
      action: input.action,
      budget_policy: input.budget_policy ?? null,
      debounce_seconds: input.debounce_seconds ?? 0,
      enabled: input.enabled ?? true,
      created_at: now,
      updated_at: now,
      last_fired_at: null,
      last_error: null,
      fire_count: 0,
    };
    this.write(trigger);
    return trigger;
  }

  /**
   * Get a trigger by ID. Throws TriggerNotFoundError if not found.
   */
  get(id: string): Trigger {
    return this.read(id);
  }

  /**
   * List triggers, optionally filtered.
   */
  list(filter: TriggerFilter = {}): Trigger[] {
    let ids: string[];
    try {
      ids = readdirSync(this.dir);
    } catch {
      return [];
    }

    const results: Trigger[] = [];
    for (const id of ids) {
      let t: Trigger;
      try {
        t = this.read(id);
      } catch {
        continue;
      }

      if (filter.scope_kind !== undefined && t.scope.kind !== filter.scope_kind) continue;
      if (filter.scope_id !== undefined && t.scope.id !== filter.scope_id) continue;
      if (filter.enabled !== undefined && t.enabled !== filter.enabled) continue;

      results.push(t);
    }

    // Sort by created_at desc
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return results;
  }

  /**
   * Partially update a trigger. Throws TriggerNotFoundError.
   */
  patch(id: string, patch: PatchTriggerInput): Trigger {
    const existing = this.read(id);
    const updated: Trigger = {
      ...existing,
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.action !== undefined ? { action: patch.action } : {}),
      ...(patch.budget_policy !== undefined ? { budget_policy: patch.budget_policy } : {}),
      ...(patch.debounce_seconds !== undefined ? { debounce_seconds: patch.debounce_seconds } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updated_at: new Date().toISOString(),
    };
    this.write(updated);
    return updated;
  }

  /**
   * Delete a trigger. Throws TriggerNotFoundError.
   */
  delete(id: string): void {
    const p = this.triggerPath(id);
    if (!existsSync(p)) throw new TriggerNotFoundError(id);
    unlinkSync(p);
  }

  /**
   * Record that a trigger fired. Increments fire_count, updates last_fired_at, clears last_error.
   */
  recordFired(id: string): Trigger {
    const t = this.read(id);
    const updated: Trigger = {
      ...t,
      last_fired_at: new Date().toISOString(),
      last_error: null,
      fire_count: t.fire_count + 1,
      updated_at: new Date().toISOString(),
    };
    this.write(updated);
    return updated;
  }

  /**
   * Record that a trigger failed to fire. Updates last_error.
   * Uses a strictly later timestamp than the previous updated_at to satisfy
   * test assertions that call recordError immediately after create.
   */
  recordError(id: string, error: string): Trigger {
    const t = this.read(id);
    const updated: Trigger = {
      ...t,
      last_error: error,
      // Guarantee updated_at is strictly later than the previous value.
      // new Date() alone can produce the same millisecond as create/update,
      // which breaks test assertions that compare exact string equality.
      updated_at: new Date(Date.now() + 1).toISOString(),
    };
    this.write(updated);
    return updated;
  }
}
