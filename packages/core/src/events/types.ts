/**
 * Canonical event envelope. Every event in every session's JSONL log uses
 * this shape. Topic-specific payloads live in `data`.
 *
 * Envelope fields are stable v1 per api.md. Additive changes (new topics,
 * new fields inside `data`) do not bump `_v`.
 */
export type EventEnvelope<T = unknown> = {
  readonly _v: 1;
  readonly id: string; // monotonic; see makeId
  readonly timestamp: string; // ISO-8601, UTC
  readonly topic: string; // e.g. "session.update", "scheduler.permit.grant"
  readonly data: T;
};

/**
 * Monotonic event-id generator. IDs are lexicographically sortable because
 * both the ms timestamp and sequence counter are fixed-width zero-padded.
 *
 * Format: `{ms:013}.{seq:06}` — 13 digits of ms (room to year ~2286), 6 of seq.
 * The counter resets each ms.
 */
export function makeIdGenerator(now: () => number = Date.now): () => string {
  let lastMs = 0;
  let seq = 0;
  return () => {
    const ms = now();
    if (ms === lastMs) {
      seq += 1;
    } else {
      lastMs = ms;
      seq = 0;
    }
    return `${ms.toString().padStart(13, "0")}.${seq.toString().padStart(6, "0")}`;
  };
}

/** Build an envelope with a generated id and current timestamp. */
export function makeEvent<T>(
  topic: string,
  data: T,
  nextId: () => string,
  now: () => number = Date.now,
): EventEnvelope<T> {
  return {
    _v: 1,
    id: nextId(),
    timestamp: new Date(now()).toISOString(),
    topic,
    data,
  };
}
