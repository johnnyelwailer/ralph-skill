import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * A file we want to read new bytes from over time.  `position` tracks the
 * last byte offset we have already consumed so the next read picks up where
 * the previous one left off.
 */
export type TailedFile = {
  readonly path: string;
  position: number;
};

/**
 * Read the new bytes appended to a file since the last drain and yield each
 * non-empty line.  Resilient to the file not yet existing — returns no lines
 * in that case.  The poller will retry on the next tick.
 */
export function drainTailedLines(tailed: TailedFile): AsyncIterable<string> {
  return (async function* () {
    let size: number;
    try {
      size = statSync(tailed.path).size;
    } catch {
      return;
    }
    if (size <= tailed.position) return;
    const stream = createReadStream(tailed.path, { start: tailed.position, encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let consumed = false;
    try {
      for await (const line of rl) {
        if (line.length === 0) continue;
        consumed = true;
        yield line;
      }
    } finally {
      rl.close();
      stream.close();
      if (consumed) {
        try {
          tailed.position = statSync(tailed.path).size;
        } catch {
          // ignore — next poll will retry
        }
      }
    }
  })();
}
