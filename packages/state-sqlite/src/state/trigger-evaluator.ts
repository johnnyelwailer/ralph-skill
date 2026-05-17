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

async function executeCreateSession(
  deps: TriggerEvaluatorDeps,
  triggerId: string,
  target: {
    readonly project_id?: string;
    readonly workflow?: string;
    readonly provider_chain?: readonly string[];
    readonly parent_session_id?: string;
    readonly max_iterations?: number;
    readonly issue?: number | null;
    readonly reason?: string;
    readonly source_event_id?: string;
  },
): Promise<void> {
  await deps.events.append("session.create_request", {
    trigger_id: triggerId,
    project_id: target.project_id ?? null,
    workflow: target.workflow ?? null,
    provider_chain: target.provider_chain ?? null,
    parent_session_id: target.parent_session_id ?? null,
    max_iterations: target.max_iterations ?? null,
    issue: target.issue ?? null,
    reason: target.reason ?? null,
    source_event_id: target.source_event_id ?? null,
    requested_at: new Date().toISOString(),
  });
}

async function executeCreateArtifact(
  deps: TriggerEvaluatorDeps,
  triggerId: string,
  target: {
    readonly project_id?: string;
    readonly session_id?: string;
    readonly kind?: string;
    readonly filename?: string;
    readonly media_type?: string;
    readonly bytes?: number;
    readonly metadata?: Record<string, unknown>;
    readonly reason?: string;
    readonly source_event_id?: string;
  },
): Promise<void> {
  await deps.events.append("artifact.create_request", {
    trigger_id: triggerId,
    project_id: target.project_id ?? null,
    session_id: target.session_id ?? null,
    kind: target.kind ?? "unknown",
    filename: target.filename ?? null,
    media_type: target.media_type ?? "application/octet-stream",
    bytes: target.bytes ?? 0,
    metadata: target.metadata ?? null,
    reason: target.reason ?? null,
    source_event_id: target.source_event_id ?? null,
    requested_at: new Date().toISOString(),
  });
}

async function executeEmitAlert(
  deps: TriggerEvaluatorDeps,
  triggerId: string,
  target: { readonly message?: string },
): Promise<void> {
  await deps.events.append("trigger.alert_emit_request", {
    trigger_id: triggerId,
    message: target.message ?? null,
    emitted_at: new Date().toISOString(),
  });
}

async function executeQueueWorkflowHandler(
  deps: TriggerEvaluatorDeps,
  triggerId: string,
  target: {
    readonly session_id?: string;
    readonly handler?: string;
    readonly reason?: string;
    readonly source_event_id?: string;
  },
): Promise<void> {
  await deps.events.append("workflow_handler.queued", {
    trigger_id: triggerId,
    session_id: target.session_id ?? null,
    handler: target.handler ?? null,
    reason: target.reason ?? null,
    source_event_id: target.source_event_id ?? null,
    queued_at: new Date().toISOString(),
  });
}

async function executeFireMonitorProfile(
  deps: TriggerEvaluatorDeps,
  triggerId: string,
  target: { readonly artifact_id?: string },
): Promise<void> {
  await deps.events.append("trigger.monitor_fire_request", {
    trigger_id: triggerId,
    artifact_id: target.artifact_id ?? null,
    fired_at: new Date().toISOString(),
  });
}

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
        } else if (trigger.action.kind === "create_session") {
          const target = trigger.action.target;
          await executeCreateSession(deps, trigger.id, {
            ...(target.project_id !== undefined && { project_id: target.project_id }),
            ...(target.workflow !== undefined && { workflow: target.workflow }),
            ...(target.provider_chain !== undefined && { provider_chain: target.provider_chain }),
            ...(target.parent_session_id !== undefined && { parent_session_id: target.parent_session_id }),
            ...(target.max_iterations !== undefined && { max_iterations: target.max_iterations }),
            ...(target.issue !== undefined && { issue: target.issue }),
            ...(target.reason !== undefined && { reason: target.reason }),
            ...(target.source_event_id !== undefined && { source_event_id: target.source_event_id }),
          });
        } else if (trigger.action.kind === "create_artifact") {
          const target = trigger.action.target;
          await executeCreateArtifact(deps, trigger.id, {
            ...(target.project_id !== undefined && { project_id: target.project_id }),
            ...(target.session_id !== undefined && { session_id: target.session_id }),
            ...(target.kind !== undefined && { kind: target.kind }),
            ...(target.filename !== undefined && { filename: target.filename }),
            ...(target.media_type !== undefined && { media_type: target.media_type }),
            ...(target.bytes !== undefined && { bytes: target.bytes }),
            ...(target.metadata !== undefined && { metadata: target.metadata }),
            ...(target.reason !== undefined && { reason: target.reason }),
            ...(target.source_event_id !== undefined && { source_event_id: target.source_event_id }),
          });
        } else if (trigger.action.kind === "emit_alert") {
          const target = trigger.action.target;
          await executeEmitAlert(deps, trigger.id, {
            ...(target.message !== undefined && { message: target.message }),
          });
        } else if (trigger.action.kind === "queue_workflow_handler") {
          const target = trigger.action.target;
          await executeQueueWorkflowHandler(deps, trigger.id, {
            ...(target.session_id !== undefined && { session_id: target.session_id }),
            ...(target.handler !== undefined && { handler: target.handler }),
            ...(target.reason !== undefined && { reason: target.reason }),
            ...(target.source_event_id !== undefined && { source_event_id: target.source_event_id }),
          });
        } else if (trigger.action.kind === "fire_monitor_profile") {
          const target = trigger.action.target;
          await executeFireMonitorProfile(deps, trigger.id, {
            ...(target.artifact_id !== undefined && { artifact_id: target.artifact_id }),
          });
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