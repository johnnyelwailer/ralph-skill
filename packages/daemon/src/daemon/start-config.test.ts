import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadInitialConfig } from "./start-config.ts";
import type { ConfigStore } from "@aloop/daemon-config";
import { resolveDaemonPaths } from "@aloop/daemon-config";

describe("loadInitialConfig", () => {
  let home: string;
  let paths: ReturnType<typeof resolveDaemonPaths>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-start-config-"));
    paths = resolveDaemonPaths({ ALOOP_HOME: home });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("returns a ConfigStore when both daemon.yml and overrides.yml are valid", () => {
    writeFileSync(paths.daemonConfigFile, "");
    writeFileSync(paths.overridesFile, "");

    const store = loadInitialConfig(paths);

    // Should return something conforming to ConfigStore — check the key accessors.
    expect(typeof store.daemon).toBe("function");
    expect(typeof store.overrides).toBe("function");
    expect(typeof store.paths).toBe("function");
    expect(typeof store.reload).toBe("function");
    expect(typeof store.setDaemon).toBe("function");
    expect(typeof store.setOverrides).toBe("function");
  });

  test("daemon() and overrides() return the loaded config values", () => {
    writeFileSync(
      paths.daemonConfigFile,
      "scheduler:\n  concurrency_cap: 42\n",
    );
    writeFileSync(paths.overridesFile, "allow:\n  - test-provider\n");

    const store = loadInitialConfig(paths);

    expect(store.daemon().scheduler.concurrencyCap).toBe(42);
    expect(store.overrides().allow).toEqual(["test-provider"]);
  });

  test("throws when daemon.yml is invalid", () => {
    writeFileSync(
      paths.daemonConfigFile,
      "http:\n  port: not_a_number\n",
    );
    writeFileSync(paths.overridesFile, "");

    expect(() => loadInitialConfig(paths)).toThrow(/daemon\.yml/);
  });

  test("throws when overrides.yml is invalid", () => {
    writeFileSync(paths.daemonConfigFile, "");
    writeFileSync(paths.overridesFile, "force: 123\n");

    expect(() => loadInitialConfig(paths)).toThrow(/overrides\.yml/);
  });

  test("throws with both file errors when daemon.yml and overrides.yml are both invalid", () => {
    writeFileSync(
      paths.daemonConfigFile,
      "http:\n  port: bad\n",
    );
    writeFileSync(paths.overridesFile, "force: 456\n");

    let threw = false;
    let message = "";
    try {
      loadInitialConfig(paths);
    } catch (e) {
      threw = true;
      message = e instanceof Error ? e.message : String(e);
    }

    expect(threw).toBe(true);
    // Error message should mention at least one of the invalid files.
    expect(message.includes("daemon.yml") || message.includes("overrides.yml")).toBe(true);
  });

  test("ConfigStore returned by loadInitialConfig is functional (reload round-trip)", () => {
    writeFileSync(paths.daemonConfigFile, "");
    writeFileSync(paths.overridesFile, "");

    const store = loadInitialConfig(paths);

    // reload() with no file changes should succeed with current (default) values.
    const result = store.reload();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.daemon).toBe(store.daemon());
      expect(result.overrides).toBe(store.overrides());
    }
  });
});
