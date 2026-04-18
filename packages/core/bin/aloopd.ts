#!/usr/bin/env bun
import { startDaemon } from "../src/daemon/start.ts";

const port = Number.parseInt(process.env.ALOOP_PORT ?? "7777", 10);

const daemon = await startDaemon({ port });

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
