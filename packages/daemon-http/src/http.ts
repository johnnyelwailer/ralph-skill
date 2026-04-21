import { makeFetchHandler, type RouterDeps } from "./router.ts";

export type StartHttpOptions = {
  hostname?: string;
  port: number;
  deps: RouterDeps;
};

export type RunningHttp = {
  server: ReturnType<typeof Bun.serve>;
  port: number;
  hostname: string;
  stop(): Promise<void>;
};

export function startHttp(opts: StartHttpOptions): RunningHttp {
  const hostname = opts.hostname ?? "127.0.0.1";
  const fetch = makeFetchHandler(opts.deps);

  const server = Bun.serve({ hostname, port: opts.port, fetch });

  if (server.port === undefined) {
    throw new Error("HTTP server failed to bind a port");
  }

  return {
    server,
    port: server.port,
    hostname,
    async stop() {
      server.stop(true);
    },
  };
}
