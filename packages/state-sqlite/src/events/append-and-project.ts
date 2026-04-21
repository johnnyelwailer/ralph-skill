import type { Database } from "bun:sqlite";
import { makeEvent, type EventEnvelope, type EventStore } from "@aloop/core";
import type { Projector } from "../state/projector.ts";

export type EventWriter = {
  append<T>(topic: string, data: T): Promise<EventEnvelope<T>>;
};

export function createEventWriter(deps: {
  db: Database;
  store: EventStore;
  projectors: readonly Projector[];
  nextId: () => string;
  now?: () => number;
}): EventWriter {
  const tx = deps.db.transaction((event: EventEnvelope) => {
    for (const projector of deps.projectors) projector.apply(deps.db, event);
  });

  return {
    async append<T>(topic: string, data: T): Promise<EventEnvelope<T>> {
      const event = makeEvent(topic, data, deps.nextId, deps.now);
      await deps.store.append(event);
      tx(event);
      return event;
    },
  };
}
