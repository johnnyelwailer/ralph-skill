// ── Session ────────────────────────────────────────────────────────────────────

export type SessionKind = "standalone" | "orchestrator" | "child";

export type SessionStatus =
  | "pending"
  | "running"
  | "interrupted"
  | "stopped"
  | "paused"
  | "completed"
  | "failed";

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

export interface CreateSessionInput {
  readonly id?: string;
  readonly projectId: string;
  readonly kind: SessionKind;
  readonly workflow: string;
  readonly providerChain: readonly string[];
  readonly issueRef?: string | null;
  readonly parentSessionId?: string | null;
  readonly maxIterations?: number | null;
  readonly notes?: string;
  readonly now?: string;
}

export interface SessionFilter {
  readonly projectId?: string;
  readonly status?: readonly SessionStatus[];
  readonly kind?: readonly SessionKind[];
  readonly parentSessionId?: string;
  readonly limit?: number;
  readonly cursor?: number;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export type AffectsCompletedWork = "yes" | "no" | "unknown";

export interface SessionQueueItem {
  readonly id: string;
  readonly sessionId: string;
  readonly filename: string;
  readonly instruction: string;
  readonly affectsCompletedWork: AffectsCompletedWork;
  readonly position: number;
  readonly createdAt: string;
}

// ── Errors ─────────────────────────────────────────────────────────────────────

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}
