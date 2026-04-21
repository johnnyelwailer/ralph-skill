import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";

/**
 * A Projector consumes events and updates SQLite projections. The contract:
 *
 * - Projectors are **pure derivations** of the event stream. Given the same
 *   sequence of events, they produce the same state, always.
 * - Projectors may be run in any order over non-overlapping event ranges,
 *   and the net effect must equal running them in-order.
 * - SQLite is a view; JSONL is the truth. Deleting any projection and
 *   re-running the projector over the log must reconstruct it bit-identically.
 *
 * See metrics.md §Storage for the full discipline.
 */
export interface Projector {
  readonly name: string;
  apply(db: Database, event: EventEnvelope): void;
}

/**
 * Per-topic counter projector. Maintains `event_counts(topic, count, updated_at)`.
 * A minimal but genuinely useful projection — used for daemon health panels
 * and for verifying the events-as-truth mechanism in tests.
 */
export class EventCountsProjector implements Projector {
  readonly name = "event_counts";

  apply(db: Database, event: EventEnvelope): void {
    db.run(
      `INSERT INTO event_counts (topic, count, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(topic) DO UPDATE SET
         count = count + 1,
         updated_at = excluded.updated_at`,
      [event.topic, event.timestamp],
    );
  }
}

/**
 * Run a projector over an async event iterable. Useful for replay from JSONL.
 * Wraps the whole replay in a transaction so partial replay doesn't produce
 * a split-brain projection.
 */
export async function runProjector(
  db: Database,
  projector: Projector,
  events: AsyncIterable<EventEnvelope>,
): Promise<number> {
  let applied = 0;
  const tx = db.transaction((batch: EventEnvelope[]) => {
    for (const e of batch) {
      projector.apply(db, e);
      applied += 1;
    }
  });
  const buffer: EventEnvelope[] = [];
  for await (const e of events) {
    buffer.push(e);
    if (buffer.length >= 500) {
      tx(buffer);
      buffer.length = 0;
    }
  }
  if (buffer.length > 0) tx(buffer);
  return applied;
}

/** Reset a specific projection's tables to empty. Useful before replay. */
export function clearEventCounts(db: Database): void {
  db.run(`DELETE FROM event_counts`);
}
