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
export {
  SchedulerMetricsProjector,
  loadSchedulerMetrics,
  type SchedulerMetricsSnapshot,
} from "./state/scheduler-projector.ts";
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
  ArtifactNotFoundError,
  ArtifactRegistry,
  type Artifact,
  type ArtifactFilter,
  type ArtifactKind,
  type CreateArtifactInput,
} from "./state/artifacts.ts";
export {
  WorkspaceNotFoundError,
  WorkspaceRegistry,
  type CreateWorkspaceInput,
  type Workspace,
  type WorkspaceFilter,
  type WorkspaceProject,
  type WorkspaceProjectRole,
} from "./state/workspaces.ts";
export { WorkspaceProjector } from "./state/workspace-projector.ts";
export {
  EventCountsProjector,
  clearEventCounts,
  runProjector,
  type Projector,
} from "./state/projector.ts";
import type { IncubationItemState } from "@aloop/core";

export type IncubationItemFilter = {
  readonly state?: IncubationItemState;
  readonly project_id?: string;
  readonly scope_kind?: "global" | "project" | "candidate_project";
  /** Full-text search across title and body. */
  readonly q?: string;
};

export {
  IncubationItemNotFoundError,
  IncubationItemRegistry,
  IncubationProposalNotFoundError,
  IncubationProposalRegistry,
  OutreachPlanNotFoundError,
  OutreachPlanRegistry,
  ResearchMonitorNotFoundError,
  ResearchMonitorRegistry,
  ResearchRunNotFoundError,
  ResearchRunRegistry,
  type CreateIncubationCommentInput,
  type CreateIncubationItemInput,
  type CreateIncubationProposalInput,
  type CreateOutreachPlanInput,
  type CreateResearchMonitorInput,
  type CreateResearchRunInput,
  IncubationCommentNotFoundError,
  IncubationCommentRegistry,
} from "./state/incubation.ts";
export { createIdempotencyStore, type IdempotencyStore } from "./state/idempotency.ts";
export {
  ComposerTurnNotFoundError,
  ComposerTurnRegistry,
  type CreateComposerTurnInput,
} from "./state/composer.ts";
