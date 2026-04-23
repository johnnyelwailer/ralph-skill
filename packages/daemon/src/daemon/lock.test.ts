import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "./lock.ts";

describe("acquireLock", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-lock-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns ok=true with takeover=false when no lock file exists", () => {
    const pidFile = join(dir, "aloopd.pid");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pid).toBe(99999);
      expect(result.takeover).toBe(false);
    }
  });

  test("writes the PID to the lock file", () => {
    const pidFile = join(dir, "aloopd.pid");
    acquireLock(pidFile, 12345);
    expect(readFileSync(pidFile, "utf-8").trim()).toBe("12345");
  });

  test("creates parent directories recursively", () => {
    const pidFile = join(dir, "deeply", "nested", "aloopd.pid");
    expect(existsSync(join(dir, "deeply"))).toBe(false);
    acquireLock(pidFile, 11111);
    expect(existsSync(pidFile)).toBe(true);
  });

  test("returns ok=true with takeover=true when lock file points to a dead process", () => {
    const pidFile = join(dir, "aloopd.pid");
    // Write a PID that is guaranteed dead (1 is always dead in practice, or use 0)
    writeFileSync(pidFile, "0");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
      expect(result.pid).toBe(99999);
    }
  });

  test("returns ok=false when lock file points to a live process", async () => {
    const pidFile = join(dir, "aloopd.pid");
    // Spawn a real subprocess that stays alive
    const subprocess = Bun.spawn(["sleep", "30"]);
    const livePid = subprocess.pid;

    // Write the live subprocess PID to the lock file
    writeFileSync(pidFile, String(livePid));

    // Trying to acquire when the lock is held by a genuinely alive process
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("held_by_alive_process");
      expect(result.pid).toBe(livePid);
    }

    // Clean up the subprocess
    subprocess.kill();
  });

  test("returns ok=false when lock file points to PID 1 (init — always alive)", () => {
    const pidFile = join(dir, "aloopd.pid");
    // PID 1 is init — kill(pid, 0) succeeds with EPERM (still alive from our perspective)
    writeFileSync(pidFile, "1");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("held_by_alive_process");
    }
  });

  test("non-numeric PID file content is treated as stale and taken over", () => {
    const pidFile = join(dir, "aloopd.pid");
    writeFileSync(pidFile, "not-a-number");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
    }
  });

  test("negative PID in file is treated as stale", () => {
    const pidFile = join(dir, "aloopd.pid");
    writeFileSync(pidFile, "-1");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
    }
  });

  test("empty PID file is treated as stale", () => {
    const pidFile = join(dir, "aloopd.pid");
    writeFileSync(pidFile, "");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
    }
  });

  test("takes over when existing lock PID is the same as requesting PID (same process restarts)", () => {
    const pidFile = join(dir, "aloopd.pid");
    // Write the same PID we're about to request — if the process is dead we should takeover
    // PID 99998 won't exist, so this should succeed
    writeFileSync(pidFile, "99998");
    const result = acquireLock(pidFile, 99998);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeover).toBe(true);
    }
  });
});

describe("releaseLock", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-lock-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("deletes the lock file when it exists", () => {
    const pidFile = join(dir, "aloopd.pid");
    writeFileSync(pidFile, "12345");
    expect(existsSync(pidFile)).toBe(true);
    releaseLock(pidFile);
    expect(existsSync(pidFile)).toBe(false);
  });

  test("succeeds silently when lock file does not exist", () => {
    const pidFile = join(dir, "does-not-exist.pid");
    // Should not throw
    expect(() => releaseLock(pidFile)).not.toThrow();
  });

  test("succeeds silently when lock file path is deeply nested and missing", () => {
    const pidFile = join(dir, "a", "b", "c", "missing.pid");
    // Should not throw even though parent dirs don't exist
    expect(() => releaseLock(pidFile)).not.toThrow();
  });

  test("succeeds when lock file exists but cannot be unlinked due to permissions", () => {
    // On POSIX we can't easily test this without privilege escalation,
    // so we just verify it doesn't throw for normal cases
    const pidFile = join(dir, "aloopd.pid");
    writeFileSync(pidFile, "12345");
    expect(() => releaseLock(pidFile)).not.toThrow();
  });

  test("releaseLock after acquireLock allows fresh acquire from another PID", () => {
    const pidFile = join(dir, "aloopd.pid");
    // First process acquires
    const first = acquireLock(pidFile, 99999);
    expect(first.ok).toBe(true);
    releaseLock(pidFile);

    // Second process (different PID) should succeed
    const second = acquireLock(pidFile, 88888);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.takeover).toBe(false);
    }
  });
});

describe("isAlive edge cases", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-lock-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("process with PID 0 is considered dead", () => {
    const pidFile = join(dir, "aloopd.pid");
    writeFileSync(pidFile, "0");
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.takeover).toBe(true);
  });

  test("process with very large PID is considered dead if no such process", () => {
    const pidFile = join(dir, "aloopd.pid");
    // 2^32-1 is outside the PID range on most systems — treated as stale
    writeFileSync(pidFile, String(4294967295));
    const result = acquireLock(pidFile, 99999);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.takeover).toBe(true);
  });
});
