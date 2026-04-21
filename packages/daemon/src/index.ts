export { startDaemon, type StartDaemonOptions, type RunningDaemon } from "./daemon/start.ts";
export { resolveDaemonPaths, type DaemonPaths } from "@aloop/daemon-config";
export { buildHealth, type HealthPayload } from "./routes/health.ts";
export { VERSION } from "./version.ts";
