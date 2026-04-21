import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type LockResult =
  | { ok: true; pid: number; takeover: boolean }
  | { ok: false; reason: "held_by_alive_process"; pid: number };

/**
 * Acquire a singleton PID lock file. If an existing PID file points to a live process,
 * refuse to start. If it points to a dead process, take over.
 */
export function acquireLock(pidFile: string, pid: number = process.pid): LockResult {
  mkdirSync(dirname(pidFile), { recursive: true });

  if (existsSync(pidFile)) {
    const prior = Number.parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (Number.isFinite(prior) && prior > 0 && isAlive(prior)) {
      return { ok: false, reason: "held_by_alive_process", pid: prior };
    }
    // stale lock; fall through to take over
    writeFileSync(pidFile, String(pid));
    return { ok: true, pid, takeover: true };
  }

  writeFileSync(pidFile, String(pid));
  return { ok: true, pid, takeover: false };
}

export function releaseLock(pidFile: string): void {
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile);
    } catch {
      // best-effort cleanup
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM: exists but owned by another user (still alive)
    return code === "EPERM";
  }
}
