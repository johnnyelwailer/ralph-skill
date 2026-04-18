import type { EventEnvelope } from "./types.ts";

/**
 * Authoritative event log. JSONL-per-session is the v1 implementation
 * (see jsonl.ts). Other storage (object storage in v2) implements the same
 * interface.
 *
 * Invariants:
 * - append() is durable — on return, the event survives a crash.
 * - read() yields events in monotonic id order.
 * - closed logs cannot be reopened for append without explicit re-open.
 */
export interface EventStore {
  append(event: EventEnvelope): Promise<void>;
  read(since?: string): AsyncIterable<EventEnvelope>;
  close(): Promise<void>;
}
