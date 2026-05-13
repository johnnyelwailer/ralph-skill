import type { Database } from "bun:sqlite";
import type {
  CreateSessionInput,
  Session,
  SessionFilter,
  SessionQueueItem,
  SessionStatus,
} from "./sessions-store";
import {
  SessionNotFoundError,
} from "./sessions-store";
import {
  deleteQueueItem,
  deleteSession,
  getQueueItem,
  getSessionById,
  getSessionMetrics,
  insertQueueItem,
  insertSession,
  listQueueItems,
  listSessionsFromDb,
  updateSessionLastEventId,
  updateSessionPhase,
  updateSessionStatus,
  advanceSessionIteration,
} from "./sessions-queries";

export type { SessionQueueItem };

export class SessionRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateSessionInput): Session {
    const now = input.now ?? new Date().toISOString();
    const session: Session = {
      id: input.id ?? crypto.randomUUID(),
      projectId: input.projectId,
      kind: input.kind,
      status: "pending",
      workflow: input.workflow,
      providerChain: input.providerChain,
      issueRef: input.issueRef ?? null,
      parentSessionId: input.parentSessionId ?? null,
      maxIterations: input.maxIterations ?? null,
      notes: input.notes ?? "",
      currentIteration: 0,
      currentPhase: null,
      currentProviderId: null,
      lastEventId: null,
      createdAt: now,
      updatedAt: now,
      stoppedAt: null,
      startedAt: null,
    };
    insertSession(this.db, session);
    return session;
  }

  get(id: string): Session | undefined {
    return getSessionById(this.db, id);
  }

  list(filter: SessionFilter = {}): Session[] {
    return listSessionsFromDb(this.db, filter);
  }

  updateStatus(
    id: string,
    status: SessionStatus,
    opts?: { stoppedAt?: string; startedAt?: string },
  ): Session {
    const now = new Date().toISOString();
    const existing = getSessionById(this.db, id);
    if (!existing) throw new SessionNotFoundError(id);
    updateSessionStatus(
      this.db,
      id,
      status,
      now,
      opts?.stoppedAt,
      opts?.startedAt,
    );
    return getSessionById(this.db, id)!;
  }

  updatePhase(id: string, phase: string, providerId: string | null): Session {
    const existing = getSessionById(this.db, id);
    if (!existing) throw new SessionNotFoundError(id);
    updateSessionPhase(this.db, id, phase, providerId, new Date().toISOString());
    return getSessionById(this.db, id)!;
  }

  advanceIteration(id: string): Session {
    const existing = getSessionById(this.db, id);
    if (!existing) throw new SessionNotFoundError(id);
    advanceSessionIteration(this.db, id, new Date().toISOString());
    return getSessionById(this.db, id)!;
  }

  updateLastEventId(id: string, eventId: string): void {
    updateSessionLastEventId(this.db, id, eventId, new Date().toISOString());
  }

  delete(id: string): void {
    const existing = getSessionById(this.db, id);
    if (!existing) throw new SessionNotFoundError(id);
    deleteSession(this.db, id);
  }

  // ── Queue ────────────────────────────────────────────────────────────────

  enqueue(item: Omit<SessionQueueItem, "id" | "createdAt">): SessionQueueItem {
    const queueItem: SessionQueueItem = {
      id: crypto.randomUUID(),
      sessionId: item.sessionId,
      filename: item.filename,
      instruction: item.instruction,
      affectsCompletedWork: item.affectsCompletedWork,
      position: item.position,
      createdAt: new Date().toISOString(),
    };
    insertQueueItem(this.db, queueItem);
    return queueItem;
  }

  listQueue(sessionId: string): SessionQueueItem[] {
    return listQueueItems(this.db, sessionId);
  }

  dequeueItem(sessionId: string, itemId: string): void {
    const item = getQueueItem(this.db, sessionId, itemId);
    if (!item) throw new Error(`queue item not found: ${itemId} in session ${sessionId}`);
    deleteQueueItem(this.db, itemId);
  }

  getSessionMetrics(sessionId: string): Array<{ name: string; value: number; updatedAt: string }> {
    return getSessionMetrics(this.db, sessionId);
  }
}
