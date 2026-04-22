import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveDaemonPaths } from "./paths.ts";

describe("resolveDaemonPaths", () => {
  test("defaults to ~/.aloop when ALOOP_HOME is unset", () => {
    const paths = resolveDaemonPaths({});
    const expected = join(homedir(), ".aloop");
    expect(paths.home).toBe(expected);
    expect(paths.pidFile).toBe(join(expected, "aloopd.pid"));
    expect(paths.socketFile).toBe(join(expected, "aloopd.sock"));
    expect(paths.stateDir).toBe(join(expected, "state"));
    expect(paths.daemonConfigFile).toBe(join(expected, "daemon.yml"));
    expect(paths.overridesFile).toBe(join(expected, "overrides.yml"));
    expect(paths.logFile).toBe(join(expected, "state", "aloopd.log"));
  });

  test("honors ALOOP_HOME override", () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: "/tmp/alt-aloop" });
    expect(paths.home).toBe("/tmp/alt-aloop");
    expect(paths.pidFile).toBe("/tmp/alt-aloop/aloopd.pid");
    expect(paths.socketFile).toBe("/tmp/alt-aloop/aloopd.sock");
    expect(paths.stateDir).toBe("/tmp/alt-aloop/state");
    expect(paths.logFile).toBe("/tmp/alt-aloop/state/aloopd.log");
  });
});
