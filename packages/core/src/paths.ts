import { homedir } from "node:os";
import { join } from "node:path";

export type DaemonPaths = {
  home: string;
  pidFile: string;
  socketFile: string;
  stateDir: string;
  logFile: string;
};

export function resolveDaemonPaths(env: Record<string, string | undefined> = process.env): DaemonPaths {
  const home = env.ALOOP_HOME ?? join(homedir(), ".aloop");
  return {
    home,
    pidFile: join(home, "aloopd.pid"),
    socketFile: join(home, "aloopd.sock"),
    stateDir: join(home, "state"),
    logFile: join(home, "state", "aloopd.log"),
  };
}
