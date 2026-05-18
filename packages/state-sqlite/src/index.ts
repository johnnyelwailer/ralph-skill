export { createEventWriter, type EventWriter } from "./events/append-and-project.ts";
export {
  JsonlEventStore,
  appendEventOnce,
  readAllEvents,
  simpleAppend,
} from "@aloop/event-jsonl";
export { openDatabase, Database, type OpenedDatabase } from "@aloop/sqlite-db";
export {
  loadBundledMigrations,
  loadMigrationsFromDir,
  migrate,
  type Migration,
  type MigrateResult,
} from "@aloop/sqlite-db";
export { PermitProjector } from "./state/permit-projector.ts";
export { SchedulerMetricsProjector } from "./state/scheduler-projector.ts";
export {
  PermitRegistry,
  clearPermits,
  projectGrantedPermit,
  projectPermitRemoval,
  type GrantedPermitProjection,
  type Permit,
} from "./state/permits.ts";
export {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  ProjectRegistry,
  canonicalizeProjectPath,
  type CreateProjectInput,
  type Project,
  type ProjectFilter,
  type ProjectStatus,
} from "./state/projects.ts";
export {
  EventCountsProjector,
  clearEventCounts,
  runProjector,
  type Projector,
} from "./state/projector.ts";
export {
  WorkspaceRegistry,
} from "./state/workspaces";
export {
  WorkspaceProjector,
} from "./state/workspace-projector.ts";
export {
  ArtifactRegistry,
  ArtifactNotFoundError,
  emitArtifactChanged,
  type Artifact,
  type ArtifactFilter,
  type ArtifactKind,
  type CreateArtifactInput,
} from "./state/artifacts.ts";
export {
  ComposerTurnRegistry,
  ComposerTurnNotFoundError,
  emitComposerSubagentChanged,
  emitComposerActionPreviewed,
} from "./state/composer.ts";
export type {
  ComposerTurn,
  ComposerTurnFilter,
  ComposerTurnScope,
  ComposerTurnScopeKind,
  ComposerTurnStatus,
  CreateComposerTurnInput,
} from "@aloop/core";
export {
  createIdempotencyStore,
  type IdempotencyResult,
  type IdempotencyStore,
} from "./state/idempotency.ts";
export {
  SessionRegistry,
  type SessionQueueItem,
} from "./state/sessions-registry";
export {
  TurnRegistry,
  TurnNotFoundError,
  type Turn,
  type TurnFilter,
  type TurnPhase,
  type CreateTurnInput,
  type UpdateTurnInput,
} from "./state/turns.ts";
export {
  executeRefreshProjection,
  emitTriggerFired,
  emitTriggerFailed,
  emitTriggerSkipped,
  parseDurationToMs,
  getNextFireTime,
  type TriggerEngineDeps,
  type RefreshProjectionTarget,
} from "./state/trigger-engine.ts";
export {
  evaluateTriggers,
  type TriggerEvaluatorDeps,
} from "./state/trigger-evaluator.ts";
export type {
  Session,
  SessionKind,
  SessionStatus,
  SessionFilter,
  CreateSessionInput,
  SessionNotFoundError,
  AffectsCompletedWork,
} from "./state/sessions-store";
