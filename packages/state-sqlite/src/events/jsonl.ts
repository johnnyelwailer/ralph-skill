import { existsSync, mkdirSync } from "node:fs";
import { appendFile, open, type FileHandle } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname } from "node:path";
import type { EventEnvelope, EventStore } from "@aloop/core";

/**
 * JSONL-backed EventStore. One event per line, append-only, fsync on every
 * append so a crash cannot lose a previously-returned event.
 *
 * Read path uses a streaming line reader so replay works on arbitrarily large
 * logs without loading them into memory.
 */
export class JsonlEventStore implements EventStore {
  private fh: FileHandle | undefined;
  private closed = false;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  async append(event: EventEnvelope): Promise<void> {
    if (this.closed) {
      throw new Error("EventStore closed");
    }
    if (!this.fh) {
      this.fh = await open(this.path, "a");
    }
    const line = JSON.stringify(event) + "\n";
    await this.fh.appendFile(line, "utf-8");
    await this.fh.sync(); // fsync — durable before returning
  }

  async *read(since?: string): AsyncIterable<EventEnvelope> {
    if (!existsSync(this.path)) return;
    const stream = createReadStream(this.path, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        if (line.length === 0) continue;
        const parsed = JSON.parse(line) as EventEnvelope;
        if (since !== undefined && parsed.id <= since) continue;
        yield parsed;
      }
    } finally {
      rl.close();
      stream.close();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.fh) {
      await this.fh.close();
      this.fh = undefined;
    }
  }
}

/** One-shot append helper for callers that don't hold a long-lived handle. */
export async function appendEventOnce(path: string, event: EventEnvelope): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const fh = await open(path, "a");
  try {
    await fh.appendFile(JSON.stringify(event) + "\n", "utf-8");
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/** Convenience: collect all events (small logs, test fixtures). */
export async function readAllEvents(path: string): Promise<EventEnvelope[]> {
  const store = new JsonlEventStore(path);
  const out: EventEnvelope[] = [];
  for await (const e of store.read()) out.push(e);
  await store.close();
  return out;
}

/** Direct filesystem append without a class — lighter for one-off uses. */
export async function simpleAppend(path: string, event: EventEnvelope): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(event) + "\n", { encoding: "utf-8" });
}
