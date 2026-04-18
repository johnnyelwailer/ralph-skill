import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../src/daemon/lock.ts";

describe("acquireLock / releaseLock", () => {
  let dir: string;
  let pidFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-lock-"));
    pidFile = join(dir, "aloopd.pid");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("acquires when no prior lock exists", () => {
    const result = acquireLock(pidFile, 4242);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(false);
      expect(result.pid).toBe(4242);
    }
    expect(existsSync(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf-8").trim()).toBe("4242");
  });

  test("refuses takeover when prior PID is alive", () => {
    // Our own process is guaranteed alive.
    writeFileSync(pidFile, String(process.pid));
    const result = acquireLock(pidFile, 9999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("held_by_alive_process");
      expect(result.pid).toBe(process.pid);
    }
  });

  test("takes over when prior PID is dead", () => {
    // PID 1 is the init process and effectively never dies, so we need a fake dead PID.
    // Using a very large number that's extremely unlikely to be assigned.
    writeFileSync(pidFile, "2147483646");
    const result = acquireLock(pidFile, 5555);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
      expect(result.pid).toBe(5555);
    }
    expect(readFileSync(pidFile, "utf-8").trim()).toBe("5555");
  });

  test("takes over when prior file is malformed", () => {
    writeFileSync(pidFile, "not-a-pid\n");
    const result = acquireLock(pidFile, 7777);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
    }
  });

  test("releaseLock removes the file", () => {
    acquireLock(pidFile, 1234);
    expect(existsSync(pidFile)).toBe(true);
    releaseLock(pidFile);
    expect(existsSync(pidFile)).toBe(false);
  });

  test("releaseLock is idempotent when file is already gone", () => {
    releaseLock(pidFile);
    expect(existsSync(pidFile)).toBe(false);
  });
});
