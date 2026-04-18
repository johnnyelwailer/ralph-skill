import { existsSync, unlinkSync } from "node:fs";
import { makeFetchHandler, type RouterDeps } from "./router.ts";

export type StartSocketOptions = {
  path: string;
  deps: RouterDeps;
};

export type RunningSocket = {
  server: ReturnType<typeof Bun.serve>;
  path: string;
  stop(): Promise<void>;
};

export function startSocket(opts: StartSocketOptions): RunningSocket {
  // Remove stale socket file (typical after unclean shutdown).
  if (existsSync(opts.path)) {
    try {
      unlinkSync(opts.path);
    } catch {
      // best-effort; if we can't remove it, bind will fail clearly below.
    }
  }

  const fetch = makeFetchHandler(opts.deps);
  const server = Bun.serve({ unix: opts.path, fetch });

  return {
    server,
    path: opts.path,
    async stop() {
      server.stop(true);
      if (existsSync(opts.path)) {
        try {
          unlinkSync(opts.path);
        } catch {
          // best-effort cleanup
        }
      }
    },
  };
}
