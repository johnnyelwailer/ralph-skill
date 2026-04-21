import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DAEMON_DEFAULTS,
  loadDaemonConfig,
  loadOverridesConfig,
  OVERRIDES_DEFAULT,
} from "@aloop/config-schema";
import { resolveDaemonPaths } from "../paths.ts";
import { createConfigStore } from "./store.ts";

describe("createConfigStore", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-cfg-store-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function makeStore() {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    const daemon = loadDaemonConfig(paths.daemonConfigFile);
    const overrides = loadOverridesConfig(paths.overridesFile);
    if (!daemon.ok || !overrides.ok) throw new Error("setup failure");
    return createConfigStore({ daemon: daemon.value, overrides: overrides.value, paths });
  }

  test("initial view returns the values it was created with", () => {
    const store = makeStore();
    expect(store.daemon()).toEqual(DAEMON_DEFAULTS);
    expect(store.overrides()).toEqual(OVERRIDES_DEFAULT);
  });

  test("reload picks up disk changes to daemon.yml", () => {
    const store = makeStore();
    expect(store.daemon().http.port).toBe(7777);

    writeFileSync(store.paths().daemonConfigFile, "http:\n  port: 9999\n");
    const result = store.reload();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.daemon.http.port).toBe(9999);
    expect(store.daemon().http.port).toBe(9999);
  });

  test("reload picks up disk changes to overrides.yml", () => {
    const store = makeStore();
    writeFileSync(store.paths().overridesFile, "deny:\n  - claude\n");
    const result = store.reload();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.overrides.deny).toEqual(["claude"]);
    expect(store.overrides().deny).toEqual(["claude"]);
  });

  test("reload reports invalid daemon.yml without committing changes", () => {
    const store = makeStore();
    writeFileSync(store.paths().daemonConfigFile, "http:\n  port: 999999\n");
    const result = store.reload();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.startsWith("daemon.yml:"))).toBe(true);
    }
    expect(store.daemon().http.port).toBe(7777);
  });

  test("setOverrides persists to disk and updates in-memory", () => {
    const store = makeStore();
    const next = { allow: ["opencode"], deny: null, force: null };
    const ret = store.setOverrides(next);
    expect(ret).toEqual(next);
    expect(store.overrides()).toEqual(next);
    const onDisk = readFileSync(store.paths().overridesFile, "utf-8");
    expect(onDisk).toContain("opencode");
  });

  test("setDaemon persists to disk and updates in-memory", () => {
    const store = makeStore();
    const next = {
      ...store.daemon(),
      scheduler: {
        ...store.daemon().scheduler,
        concurrencyCap: 7,
      },
    };
    const ret = store.setDaemon(next);
    expect(ret.scheduler.concurrencyCap).toBe(7);
    expect(store.daemon().scheduler.concurrencyCap).toBe(7);

    const onDisk = readFileSync(store.paths().daemonConfigFile, "utf-8");
    expect(onDisk).toContain("concurrency_cap: 7");

    const parsed = loadDaemonConfig(store.paths().daemonConfigFile);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.scheduler.concurrencyCap).toBe(7);
  });
});
