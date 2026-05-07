import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCounters, type HealthCounters } from "./daemon-counters.ts";

// ─── Helper fixtures ──────────────────────────────────────────────────────────

function makeMockScheduler(permits: Array<{ id: string }> = []): { listPermits: () => typeof permits } {
  return { listPermits: () => permits };
}

function writeSession(sessionDir: string, status: string, projectId = "proj-001"): void {
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(
    join(sessionDir, "session.json"),
    JSON.stringify({
      id: sessionDir.split("/").pop()!,
      project_id: projectId,
      kind: "standalone",
      status,
      workflow: null,
      created_at: new Date().toISOString(),
    }),
    "utf-8",
  );
}

// ─── buildCounters ────────────────────────────────────────────────────────────

describe("buildCounters", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-counters-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns zero counters when sessionsDir does not exist", () => {
    const result = buildCounters(join(tmp, "nonexistent"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(0);
    expect(result.sessionsByStatus).toEqual({});
    expect(result.permitsInFlight).toBe(0);
  });

  test("returns zero counters when sessionsDir is a file (not a directory)", () => {
    writeFileSync(join(tmp, "is-a-file"), "not a dir", "utf-8");
    const result = buildCounters(join(tmp, "is-a-file"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(0);
    expect(result.sessionsByStatus).toEqual({});
    expect(result.permitsInFlight).toBe(0);
  });

  test("returns zero counters when sessionsDir is empty", () => {
    mkdirSync(join(tmp, "sessions"), { recursive: true });
    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(0);
    expect(result.sessionsByStatus).toEqual({});
    expect(result.permitsInFlight).toBe(0);
  });

  test("counts sessions by status", () => {
    const sessionsDir = join(tmp, "sessions", "proj-001");
    writeSession(join(sessionsDir, "sess-pending"), "pending");
    writeSession(join(sessionsDir, "sess-running"), "running");
    writeSession(join(sessionsDir, "sess-completed"), "completed");
    writeSession(join(sessionsDir, "sess-another-pending"), "pending");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(4);
    expect(result.sessionsByStatus["pending"]).toBe(2);
    expect(result.sessionsByStatus["running"]).toBe(1);
    expect(result.sessionsByStatus["completed"]).toBe(1);
  });

  test("groups sessions from multiple projects correctly", () => {
    writeSession(join(tmp, "sessions", "proj-a", "sess-a1"), "running");
    writeSession(join(tmp, "sessions", "proj-a", "sess-a2"), "failed");
    writeSession(join(tmp, "sessions", "proj-b", "sess-b1"), "completed");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(3);
    expect(result.sessionsByStatus["running"]).toBe(1);
    expect(result.sessionsByStatus["failed"]).toBe(1);
    expect(result.sessionsByStatus["completed"]).toBe(1);
  });

  test("skips directories that are not session directories (no session.json)", () => {
    const sessionsDir = join(tmp, "sessions", "proj-001");
    mkdirSync(join(sessionsDir, "not-a-session"), { recursive: true });
    writeFileSync(join(sessionsDir, "not-a-session", "random-file.txt"), "junk", "utf-8");
    writeSession(join(sessionsDir, "sess-001"), "running");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(1);
    expect(result.sessionsByStatus["running"]).toBe(1);
  });

  test("skips session.json that contains invalid JSON", () => {
    const sessionsDir = join(tmp, "sessions", "proj-001");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "session.json"), "not valid json{{{", "utf-8");
    writeSession(join(sessionsDir, "real-session"), "running");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(1);
    expect(result.sessionsByStatus["running"]).toBe(1);
  });

  test("skips a file entry in sessionsDir that masquerades as a session dir (ENOTDIR)", () => {
    // This simulates the case where readdirSync returns an entry that is a file
    // rather than a directory. buildCounters must catch this and continue.
    const sessionsDir = join(tmp, "sessions", "proj-001");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "session.json"), "not a directory", "utf-8");
    writeSession(join(sessionsDir, "real-session"), "running");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(1);
    expect(result.sessionsByStatus["running"]).toBe(1);
  });

  test("session with no status field falls back to 'unknown' status", () => {
    // A session directory with valid session.json that omits the status field
    // should be counted under the 'unknown' bucket.
    const sessionsDir = join(tmp, "sessions", "proj-001");
    const noStatusSession = join(sessionsDir, "no-status-session");
    mkdirSync(noStatusSession, { recursive: true });
    writeFileSync(
      join(noStatusSession, "session.json"),
      JSON.stringify({ id: "no-status-session", project_id: "proj-001" }),
      "utf-8",
    );
    writeSession(join(sessionsDir, "valid-session"), "running");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(2);
    expect(result.sessionsByStatus["running"]).toBe(1);
    expect(result.sessionsByStatus["unknown"]).toBe(1);
  });

  test("permitsInFlight reflects scheduler.listPermits()", () => {
    const sessionsDir = join(tmp, "sessions", "proj-001");
    writeSession(join(sessionsDir, "sess-001"), "running");

    const scheduler = makeMockScheduler([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    const result = buildCounters(join(tmp, "sessions"), scheduler as any);
    expect(result.permitsInFlight).toBe(3);
  });

  test("permitsInFlight is 0 when no permits are held", () => {
    const sessionsDir = join(tmp, "sessions", "proj-001");
    writeSession(join(sessionsDir, "sess-001"), "running");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler([]) as any);
    expect(result.permitsInFlight).toBe(0);
  });

  test("count is zero when sessions exist but session.json is a directory", () => {
    const sessionsDir = join(tmp, "sessions", "proj-001");
    mkdirSync(join(sessionsDir, "sess-weird"), { recursive: true });
    writeSession(join(sessionsDir, "sess-normal"), "running");

    const result = buildCounters(join(tmp, "sessions"), makeMockScheduler() as any);
    expect(result.sessionsTotal).toBe(1);
    expect(result.sessionsByStatus["running"]).toBe(1);
  });
});
