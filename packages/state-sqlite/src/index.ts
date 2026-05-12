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
  ArtifactRegistry,
  ArtifactNotFoundError,
  type Artifact,
  type ArtifactFilter,
  type ArtifactKind,
  type CreateArtifactInput,
} from "./state/artifacts.ts";
export {
  ComposerTurnRegistry,
  ComposerTurnNotFoundError,
} from "./state/composer.ts";
export type {
  ComposerTurn,
  ComposerTurnFilter,
  ComposerTurnScope,
  ComposerTurnScopeKind,
  ComposerTurnStatus,
  CreateComposerTurnInput,
} from "./state/composer.ts";
export {
  createIdempotencyStore,
  type IdempotencyResult,
  type IdempotencyStore,
} from "./state/idempotency.ts";
export {
  SessionRegistry,
  type SessionQueueItem,
} from "./state/sessions-registry";
export type {
  Session,
  SessionKind,
  SessionStatus,
  SessionFilter,
  CreateSessionInput,
  SessionNotFoundError,
  AffectsCompletedWork,
} from "./state/sessions-store";
