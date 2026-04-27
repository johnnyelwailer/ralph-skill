import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import {
  createConfigStore,
  DAEMON_DEFAULTS,
  OVERRIDES_DEFAULT,
  resolveDaemonPaths,
} from "@aloop/daemon-config";

describe("createConfigStore", () => {
  let home: string;
  let paths: ReturnType<typeof resolveDaemonPaths>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-config-store-"));
    paths = resolveDaemonPaths({ ALOOP_HOME: home });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  describe("daemon() and overrides() accessors", () => {
    test("daemon() returns the initial daemon config", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      expect(store.daemon()).toEqual(DAEMON_DEFAULTS);
    });

    test("overrides() returns the initial overrides config", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      expect(store.overrides()).toEqual(OVERRIDES_DEFAULT);
    });

    test("paths() returns the paths object passed at construction", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      expect(store.paths()).toBe(paths);
    });

    test("daemon() and overrides() return stable references", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      // Same object on every call — callers can hold the ref without stale closures.
      expect(store.daemon()).toBe(store.daemon());
      expect(store.overrides()).toBe(store.overrides());
    });
  });

  describe("setDaemon", () => {
    test("mutates daemon() to the new value", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const next = { ...DAEMON_DEFAULTS, http: { ...DAEMON_DEFAULTS.http, port: 9999 } };
      store.setDaemon(next);
      expect(store.daemon().http.port).toBe(9999);
    });

    test("returns the updated config", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const next = { ...DAEMON_DEFAULTS, http: { ...DAEMON_DEFAULTS.http, port: 1234 } };
      const result = store.setDaemon(next);
      expect(result).toEqual(next);
    });

    test("subsequent daemon() calls reflect the mutation", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const next = { ...DAEMON_DEFAULTS, scheduler: { ...DAEMON_DEFAULTS.scheduler, concurrencyCap: 77 } };
      store.setDaemon(next);
      expect(store.daemon().scheduler.concurrencyCap).toBe(77);
      expect(store.daemon().scheduler.concurrencyCap).toBe(77); // stable
    });
  });

  describe("setOverrides", () => {
    test("mutates overrides() to the new value", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const next = { allow: ["test"], deny: [], force: null };
      store.setOverrides(next);
      expect(store.overrides()).toEqual(next);
    });

    test("returns the updated config", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const next = { allow: [], deny: ["bad"], force: null };
      const result = store.setOverrides(next);
      expect(result).toEqual(next);
    });

    test("subsequent overrides() calls reflect the mutation", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const next = { allow: ["allowed"], deny: [], force: null };
      store.setOverrides(next);
      expect(store.overrides().allow).toEqual(["allowed"]);
      expect(store.overrides().allow).toEqual(["allowed"]); // stable
    });
  });

  describe("reload()", () => {
    test("reload() with valid files returns ok:true and updated configs", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });

      // Pre-write a valid daemon.yml and overrides.yml so reload() can read them.
      // Uses the canonical snake_case YAML format.
      writeFileSync(
        paths.daemonConfigFile,
        "scheduler:\n  concurrency_cap: 55\n",
      );
      writeFileSync(paths.overridesFile, "allow:\n  - reload-test\n");

      const result = store.reload();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.daemon.scheduler.concurrencyCap).toBe(55);
        expect(result.overrides.allow).toEqual(["reload-test"]);
      }
    });

    test("reload() with malformed daemon.yml returns ok:false with daemon.yml errors", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      writeFileSync(paths.daemonConfigFile, "http:\n  port: not_a_number\n");

      const result = store.reload();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("daemon.yml");
      }
    });

    test("reload() with malformed overrides.yml returns ok:false with overrides.yml errors", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      writeFileSync(paths.overridesFile, "allow: not_an_array\n");

      const result = store.reload();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("overrides.yml"))).toBe(true);
      }
    });

    test("reload() aggregates errors from both files when both are invalid", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      writeFileSync(paths.daemonConfigFile, "http:\n  port: invalid\n");
      writeFileSync(paths.overridesFile, "allow: also_invalid\n");

      const result = store.reload();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      }
    });

    test("reload() does not mutate daemon() when daemon.yml is invalid", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      writeFileSync(paths.daemonConfigFile, "http:\n  port: not_valid\n");
      // Valid overrides so only daemon.yml fails
      writeFileSync(paths.overridesFile, "");

      const before = store.daemon();
      const result = store.reload();
      expect(result.ok).toBe(false);
      // State unchanged after failed reload
      expect(store.daemon()).toEqual(before);
    });

    test("reload() does not mutate overrides() when overrides.yml is invalid", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      // Valid daemon.yml so only overrides fails
      writeFileSync(paths.daemonConfigFile, "");
      writeFileSync(paths.overridesFile, "force: 123\n");

      const before = store.overrides();
      const result = store.reload();
      expect(result.ok).toBe(false);
      expect(store.overrides()).toEqual(before);
    });

    test("reload() result daemon and overrides match the current store accessors", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      writeFileSync(paths.daemonConfigFile, "scheduler:\n  concurrency_cap: 99\n");
      writeFileSync(paths.overridesFile, "deny:\n  - blocked\n");

      const result = store.reload();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.daemon).toBe(store.daemon());
        expect(result.overrides).toBe(store.overrides());
      }
    });
  });

  describe("daemon() and overrides() update together atomically on reload", () => {
    test("a reload that only fixes daemon.yml does not update overrides", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      // Start with overridden allow list
      const initialOverrides = { allow: ["initial"], deny: [], force: null };
      store.setOverrides(initialOverrides);

      // Only update daemon.yml — overrides.yml still has the in-memory value
      writeFileSync(paths.daemonConfigFile, "scheduler:\n  concurrency_cap: 44\n");
      // overrides.yml missing/invalid so it falls back to defaults
      writeFileSync(paths.overridesFile, "");

      const result = store.reload();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.daemon.scheduler.concurrencyCap).toBe(44);
        // overrides fell back to defaults since the file was empty
        expect(result.overrides.allow).toBe(null);
      }
    });
  });

  describe("setDaemon throws when writeFileSync fails", () => {
    test("setDaemon re-throws ENOENT when the config file path is a directory", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      // Point the daemon config file at an actual directory — writeFileSync will throw.
      const badPaths = {
        ...paths,
        daemonConfigFile: paths.configDir, // configDir is a directory, not a file
      };
      const badStore = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths: badPaths,
      });
      expect(() => badStore.setDaemon(DAEMON_DEFAULTS)).toThrow();
    });
  });

  describe("setOverrides throws when writeFileSync fails", () => {
    test("setOverrides re-throws ENOENT when the overrides file path is a directory", () => {
      const store = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths,
      });
      const badPaths = {
        ...paths,
        overridesFile: paths.configDir, // configDir is a directory, not a file
      };
      const badStore = createConfigStore({
        daemon: DAEMON_DEFAULTS,
        overrides: OVERRIDES_DEFAULT,
        paths: badPaths,
      });
      expect(() => badStore.setOverrides(OVERRIDES_DEFAULT)).toThrow();
    });
  });
});
