export interface EventStore {
  append(event: unknown): Promise<void>;
  read(since?: string): AsyncIterable<unknown>;
  close(): Promise<void>;
}

/**
 * StateStore — queryable current state interface.
 *
 * Covers all daemon-native queryable objects: workspaces, projects, sessions,
 * permits, provider health, metrics, and tracker projections. Postgres is the
 * primary durable implementation; SQLite is the local/single-node implementation.
 *
 * Spec: docs/spec/daemon.md §State layout §Seam 2
 */
export interface StateStore {
  workspace: WorkspaceStore;
  project: ProjectStore;
  session: SessionStore;
  permit: PermitStore;
  providerHealth: ProviderHealthStore;
  metrics: MetricsStore;
}

// Sub-store interfaces
export interface WorkspaceStore {
  create(input: { name: string; description?: string }): Promise<Workspace>;
  get(id: string): Promise<Workspace | undefined>;
  list(filter?: WorkspaceFilter): Promise<{ items: Workspace[]; nextCursor: string | null }>;
  archive(id: string): Promise<void>;
}

export interface ProjectStore {
  create(input: {
    absPath: string;
    name?: string;
    workspaceMemberships?: { workspaceId: string; role?: ProjectWorkspaceRole }[];
  }): Promise<Project>;
  get(id: string): Promise<Project | undefined>;
  getByPath(absPath: string): Promise<Project | undefined>;
  list(filter?: ProjectFilter): Promise<{ items: Project[]; nextCursor: string | null }>;
  updateStatus(id: string, status: ProjectStatus): Promise<void>;
  touchActivity(id: string): Promise<void>;
  archive(id: string): Promise<void>;
  purge(id: string): Promise<void>;
  addWorkspace(projectId: string, workspaceId: string, role?: ProjectWorkspaceRole): Promise<void>;
  removeWorkspace(projectId: string, workspaceId: string): Promise<void>;
}

export interface SessionStore {
  create(input: {
    projectId: string;
    kind: SessionKind;
    workflow: string;
    providerChain: readonly string[];
    issueRef?: string | null;
    parentSessionId?: string | null;
    maxIterations?: number | null;
    notes?: string;
  }): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  list(filter?: SessionFilter): Promise<{ items: Session[]; nextCursor: string | null }>;
  updateStatus(id: string, status: SessionStatus): Promise<void>;
  archive(id: string): Promise<void>;
}

export interface PermitStore {
  grant(input: {
    permitId: string;
    sessionId?: string | null;
    composerTurnId?: string | null;
    controlSubagentRunId?: string | null;
    projectId?: string | null;
    providerId: string;
    ttlSeconds: number;
    estimatedCostUsdCents?: number;
  }): Promise<void>;
  revoke(permitId: string): Promise<void>;
  listActive(): Promise<Permit[]>;
  listExpired(nowIso: string): Promise<Permit[]>;
  countActive(): Promise<number>;
  countByProject(projectId: string): Promise<number>;
}

export interface ProviderHealthStore {
  upsert(input: {
    providerId: string;
    status: ProviderHealthStatus;
    quotaUsed?: number;
    quotaTotal?: number;
    cooldownUntil?: string | null;
  }): Promise<void>;
  get(providerId: string): Promise<ProviderHealth | undefined>;
  list(): Promise<ProviderHealth[]>;
  applyFailure(providerId: string, cooldownMinutes: number): Promise<void>;
}

export interface MetricsStore {
  recordEvent(topic: string, data: unknown): Promise<void>;
  getSessionMetrics(sessionId: string): Promise<SchedulerMetrics>;
}

// Shared types (from @aloop/state-projects)
export type WorkspaceFilter = {
  readonly archived?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
};

export type ProjectFilter = {
  readonly workspaceId?: string;
  readonly status?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
};

export type ProjectStatus = "setup_pending" | "ready" | "archived";

export type ProjectWorkspaceRole = "owner" | "member" | "supporting";

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultProjectId: string | null;
  readonly metadata: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface Project {
  readonly id: string;
  readonly workspaceIds: readonly string[];
  readonly absPath: string;
  readonly repoUrl: string | null;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly addedAt: string;
  readonly lastActiveAt: string | null;
}

// Session types (from @aloop/state-sqlite)
export type SessionKind = "standalone" | "orchestrator" | "child";

export type SessionStatus =
  | "pending"
  | "running"
  | "interrupted"
  | "stopped"
  | "paused"
  | "completed"
  | "failed"
  | "archived";

export interface Session {
  readonly id: string;
  readonly projectId: string;
  readonly kind: SessionKind;
  readonly status: SessionStatus;
  readonly workflow: string;
  readonly providerChain: readonly string[];
  readonly issueRef: string | null;
  readonly parentSessionId: string | null;
  readonly maxIterations: number | null;
  readonly notes: string;
  readonly currentIteration: number;
  readonly currentPhase: string | null;
  readonly currentProviderId: string | null;
  readonly lastEventId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stoppedAt: string | null;
  readonly startedAt: string | null;
}

export type SessionFilter = {
  readonly projectId?: string;
  readonly status?: readonly SessionStatus[];
  readonly kind?: readonly SessionKind[];
  readonly parentSessionId?: string;
  readonly limit?: number;
  readonly cursor?: number;
};

// Permit types (from @aloop/state-sqlite)
export interface Permit {
  readonly id: string;
  readonly sessionId: string | null;
  readonly composerTurnId: string | null;
  readonly controlSubagentRunId: string | null;
  readonly projectId: string | null;
  readonly providerId: string;
  readonly ttlSeconds: number;
  readonly grantedAt: string;
  readonly expiresAt: string;
}

// Health types
export type ProviderHealthStatus = "available" | "degraded" | "unavailable" | "unknown";

export type ProviderHealth = {
  readonly providerId: string;
  readonly status: ProviderHealthStatus;
  readonly quotaUsed: number | null;
  readonly quotaTotal: number | null;
  readonly cooldownUntil: string | null;
  readonly updatedAt: string;
};

export type SchedulerMetrics = {
  readonly concurrencyInFlight: number;
  readonly permitsActive: number;
  readonly updatedAt: string;
};