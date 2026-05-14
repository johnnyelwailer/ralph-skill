import type { TriggerStore } from "@aloop/daemon-routes-triggers";
import type { Database } from "bun:sqlite";
import type { EventStore } from "@aloop/core";
import type { EventWriter, Projector } from "@aloop/state-sqlite";
import { executeRefreshProjection, emitTriggerFired, emitTriggerFailed, getNextFireTime } from "./trigger-engine.ts";
import type { TriggerEngineDeps } from "./trigger-engine.ts";
import type { RefreshProjectionTarget } from "./trigger-engine.ts";

export type TriggerEvaluatorDeps = {
  readonly db: Database;
  readonly store: EventStore;
  readonly events: EventWriter;
  readonly projectors: readonly Projector[];
  readonly triggerStore: TriggerStore;
};

export async function evaluateTriggers(deps: TriggerEvaluatorDeps): Promise<number> {
  const { triggerStore, events, db, store, projectors } = deps;

  const allTriggers = triggerStore.list({ enabled: true });
  let fired = 0;

  for (const trigger of allTriggers) {
    if (trigger.source.kind === "time") {
      const nextFire = getNextFireTime(trigger.source.schedule ?? "P1D", trigger.last_fired_at);
      if (!nextFire || nextFire.getTime() > Date.now()) {
        continue;
      }

      try {
        if (trigger.action.kind === "refresh_projection") {
          const target: RefreshProjectionTarget = {
            projection_name: trigger.action.target.projection_name ?? "*",
            ...(trigger.action.target.projection_scope_kind !== undefined
              ? { scope_kind: trigger.action.target.projection_scope_kind }
              : {}),
            ...(trigger.action.target.projection_scope_id !== undefined
              ? { scope_id: trigger.action.target.projection_scope_id }
              : {}),
          };

          const engineDeps: TriggerEngineDeps = { db, store, events, projectors };
          await executeRefreshProjection(engineDeps, target);
        }

        triggerStore.recordFired(trigger.id);
        await emitTriggerFired(events, trigger.id, trigger.action.kind);
        fired++;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        triggerStore.recordError(trigger.id, error);
        await emitTriggerFailed(events, trigger.id, trigger.action.kind, error);
      }
    }
  }

  return fired;
}