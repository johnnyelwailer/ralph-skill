import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { countProjectSessions, projectResponse, VALID_STATUSES } from "./projects-common.ts";

describe("VALID_STATUSES", () => {
  test("contains exactly the three expected project statuses", () => {
    expect(VALID_STATUSES).toEqual(["setup_pending", "ready", "archived"]);
  });

  test("is a readonly array with three elements", () => {
    expect(VALID_STATUSES.length).toBe(3);
    expect(VALID_STATUSES[0]).toBe("setup_pending");
    expect(VALID_STATUSES[1]).toBe("ready");
    expect(VALID_STATUSES[2]).toBe("archived");
  });
});

describe("countProjectSessions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-counts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns { total: 0, by_status: {} } when projectSessionsDir does not exist", () => {
    const result = countProjectSessions(dir, "no-such-project");
    expect(result).toEqual({ total: 0, by_status: {} });
  });

  test("returns { total: 0, by_status: {} } when projectSessionsDir is a file (not a dir)", () => {
    writeFileSync(join(dir, "proj-1"), "not a directory");
    const result = countProjectSessions(dir, "proj-1");
    expect(result).toEqual({ total: 0, by_status: {} });
  });

  test("counts sessions and groups by status", () => {
    // proj-p1/s_s1/session.json
    const s1Dir = join(dir, "proj-p1", "s_s1");
    const s2Dir = join(dir, "proj-p1", "s_s2");
    const s3Dir = join(dir, "proj-p1", "s_s3");
    mkdirSync(s1Dir, { recursive: true });
    mkdirSync(s2Dir, { recursive: true });
    mkdirSync(s3Dir, { recursive: true });
    writeFileSync(join(s1Dir, "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(s2Dir, "session.json"), JSON.stringify({ status: "completed" }));
    writeFileSync(join(s3Dir, "session.json"), JSON.stringify({ status: "running" }));

    const result = countProjectSessions(dir, "proj-p1");
    expect(result.total).toBe(3);
    expect(result.by_status).toEqual({ running: 2, completed: 1 });
  });

  test("skips malformed session.json files", () => {
    const s1Dir = join(dir, "proj-p2", "s_s1");
    const s2Dir = join(dir, "proj-p2", "s_s2");
    mkdirSync(s1Dir, { recursive: true });
    mkdirSync(s2Dir, { recursive: true });
    writeFileSync(join(s1Dir, "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(s2Dir, "session.json"), "not valid json {{{");

    const result = countProjectSessions(dir, "proj-p2");
    expect(result.total).toBe(1);
    expect(result.by_status).toEqual({ running: 1 });
  });

  test("skips directories without session.json", () => {
    // Create the dirs explicitly
    const s1Dir = join(dir, "proj-p3", "s_s1");
    mkdirSync(s1Dir, { recursive: true });
    writeFileSync(join(s1Dir, "session.json"), JSON.stringify({ status: "paused" }));

    const result = countProjectSessions(dir, "proj-p3");
    expect(result.total).toBe(1);
    expect(result.by_status).toEqual({ paused: 1 });
  });

  test("handles missing status field gracefully", () => {
    const s1Dir = join(dir, "proj-p4", "s_s1");
    mkdirSync(s1Dir, { recursive: true });
    writeFileSync(join(s1Dir, "session.json"), JSON.stringify({ id: "s_s1" })); // no status

    const result = countProjectSessions(dir, "proj-p4");
    expect(result.total).toBe(1);
    expect(result.by_status).toEqual({ unknown: 1 });
  });

  test("handles empty projectSessionsDir", () => {
    const projDir = join(dir, "proj-p5");
    rmSync(projDir, { recursive: true, force: true });

    const result = countProjectSessions(dir, "proj-p5");
    expect(result).toEqual({ total: 0, by_status: {} });
  });
});

describe("projectResponse", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-response-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeProject(overrides: Partial<{
    id: string; absPath: string; name: string; status: "setup_pending" | "ready" | "archived";
    addedAt: string; lastActiveAt: string; updatedAt: string;
  }> = {}) {
    return {
      id: "proj-123",
      absPath: "/home/user/my-project",
      name: "my-project",
      status: "ready" as const,
      addedAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-02T00:00:00.000Z",
      updatedAt: "2024-01-03T00:00:00.000Z",
      ...overrides,
    };
  }

  test("maps all required fields with _v=1 envelope", () => {
    const project = makeProject();
    const result = projectResponse(project, dir);
    expect(result).toMatchObject({
      _v: 1,
      id: "proj-123",
      abs_path: "/home/user/my-project",
      name: "my-project",
      status: "ready",
      added_at: "2024-01-01T00:00:00.000Z",
      last_active_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-03T00:00:00.000Z",
    });
  });

  test("includes session_counts field from countProjectSessions", () => {
    const project = makeProject();
    // No sessions exist for this project in the empty dir
    const result = projectResponse(project, dir) as Record<string, unknown>;
    expect(result).toHaveProperty("session_counts");
    expect(result.session_counts).toEqual({ total: 0, by_status: {} });
  });

  test("uses canonical snake_case field names", () => {
    const project = makeProject({ absPath: "/a", status: "setup_pending" });
    const result = projectResponse(project, dir) as Record<string, unknown>;
    expect(result).toHaveProperty("abs_path");
    expect(result).not.toHaveProperty("absPath");
    expect(result).toHaveProperty("last_active_at");
    expect(result).not.toHaveProperty("lastActiveAt");
    expect(result).toHaveProperty("updated_at");
    expect(result).not.toHaveProperty("updatedAt");
  });

  test("returns a plain object that is JSON serializable", () => {
    const project = makeProject({ status: "archived" });
    const result = projectResponse(project, dir);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    // Should have all expected keys including session_counts
    const keys = Object.keys(result).sort();
    expect(keys).toContain("session_counts");
    expect(keys).toContain("_v");
  });

  test("passes through all status values from VALID_STATUSES", () => {
    for (const status of VALID_STATUSES) {
      const project = makeProject({ status });
      const result = projectResponse(project, dir);
      expect(result.status).toBe(status);
    }
  });

  test("returns a new object each call (no mutation risk)", () => {
    const project = makeProject();
    const result1 = projectResponse(project, dir);
    const result2 = projectResponse(project, dir);
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  test("session_counts reflects actual sessions on disk", () => {
    const project = makeProject({ id: "proj-count-test" });
    // Create some sessions
    const s1Dir = join(dir, "proj-count-test", "s_s1");
    const s2Dir = join(dir, "proj-count-test", "s_s2");
    mkdirSync(s1Dir, { recursive: true });
    mkdirSync(s2Dir, { recursive: true });
    writeFileSync(join(s1Dir, "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(s2Dir, "session.json"), JSON.stringify({ status: "completed" }));

    const result = projectResponse(project, dir) as Record<string, unknown>;
    const sc = result.session_counts as { total: number; by_status: Record<string, number> };
    expect(sc.total).toBe(2);
    expect(sc.by_status).toEqual({ running: 1, completed: 1 });
  });
});
