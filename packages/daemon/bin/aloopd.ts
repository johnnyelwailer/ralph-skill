#!/usr/bin/env bun
import { startDaemon } from "../src/daemon/start.ts";

// Port resolution priority (highest first):
//   1. ALOOP_PORT env var (operator override at launch time)
//   2. http.port from daemon.yml (loaded inside startDaemon)
//   3. DAEMON_DEFAULTS.http.port (named constant; no silent fallback)
const portOverride = process.env.ALOOP_PORT
  ? Number.parseInt(process.env.ALOOP_PORT, 10)
  : undefined;

const daemon = await startDaemon(portOverride !== undefined ? { port: portOverride } : {});

console.log(
  `aloopd listening on http://${daemon.http.hostname}:${daemon.http.port} and unix://${daemon.socket.path}`,
);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`received ${signal}, stopping...`);
  await daemon.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
});
