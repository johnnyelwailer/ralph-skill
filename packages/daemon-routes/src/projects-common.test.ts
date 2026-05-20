import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countWorkspaceProjects, countProjectSessions, projectResponse, VALID_STATUSES } from "./projects-common.ts";
import type { ProjectWorkspaceRole } from "@aloop/state-projects";

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

// ─── countWorkspaceProjects ────────────────────────────────────────────────────

describe("countWorkspaceProjects", () => {
  test("returns zero total and empty by_status for empty array", () => {
    const result = countWorkspaceProjects([]);
    expect(result.total).toBe(0);
    expect(result.by_status).toEqual({});
  });

  test("counts all projects in total regardless of status", () => {
    const projects = [
      { projectStatus: "ready" },
      { projectStatus: "archived" },
      { projectStatus: "setup_pending" },
    ];
    const result = countWorkspaceProjects(projects);
    expect(result.total).toBe(3);
  });

  test("groups counts by status value", () => {
    const projects = [
      { projectStatus: "ready" },
      { projectStatus: "ready" },
      { projectStatus: "archived" },
    ];
    const result = countWorkspaceProjects(projects);
    expect(result.by_status).toEqual({ ready: 2, archived: 1 });
  });

  test("treats missing projectStatus as 'unknown'", () => {
    const projects = [
      { projectStatus: "ready" },
      {} as { projectStatus?: string },
      { projectStatus: "archived" },
    ];
    const result = countWorkspaceProjects(projects);
    expect(result.by_status).toEqual({ ready: 1, unknown: 1, archived: 1 });
  });

  test("returns a new object each call", () => {
    const r1 = countWorkspaceProjects([{ projectStatus: "ready" }]);
    const r2 = countWorkspaceProjects([{ projectStatus: "ready" }]);
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });

  test("total is always the length of the input array", () => {
    const projects = [
      { projectStatus: "ready" },
      { projectStatus: "archived" },
      { projectStatus: "setup_pending" },
      { projectStatus: "ready" },
    ];
    const result = countWorkspaceProjects(projects);
    expect(result.total).toBe(4);
    expect(result.by_status.ready).toBe(2);
    expect(result.by_status.archived).toBe(1);
    expect(result.by_status.setup_pending).toBe(1);
  });
});

// ─── countProjectSessions ──────────────────────────────────────────────────────

describe("countProjectSessions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-count-sessions-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns { total: 0, by_status: {} } when project sessions dir does not exist", () => {
    const result = countProjectSessions(dir, "nonexistent-project");
    expect(result.total).toBe(0);
    expect(result.by_status).toEqual({});
  });

  test("counts sessions by reading session.json status field", () => {
    const projDir = join(dir, "proj-x");
    mkdirSync(join(projDir, "s_1"), { recursive: true });
    mkdirSync(join(projDir, "s_2"), { recursive: true });
    mkdirSync(join(projDir, "s_3"), { recursive: true });
    writeFileSync(join(projDir, "s_1", "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(projDir, "s_2", "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(projDir, "s_3", "session.json"), JSON.stringify({ status: "completed" }));

    const result = countProjectSessions(dir, "proj-x");
    expect(result.total).toBe(3);
    expect(result.by_status.running).toBe(2);
    expect(result.by_status.completed).toBe(1);
  });

  test("skips directories without a valid session.json", () => {
    const projDir = join(dir, "proj-y");
    mkdirSync(join(projDir, "s_1"), { recursive: true });
    mkdirSync(join(projDir, "s_2"), { recursive: true });
    writeFileSync(join(projDir, "s_1", "session.json"), JSON.stringify({ status: "running" }));
    // s_2 has no session.json — should be skipped

    const result = countProjectSessions(dir, "proj-y");
    expect(result.total).toBe(1);
    expect(result.by_status.running).toBe(1);
  });

  test("treats missing status field as 'unknown'", () => {
    const projDir = join(dir, "proj-z");
    mkdirSync(join(projDir, "s_1"), { recursive: true });
    writeFileSync(join(projDir, "s_1", "session.json"), JSON.stringify({}));
    const result = countProjectSessions(dir, "proj-z");
    expect(result.by_status.unknown).toBe(1);
  });

  test("skips malformed session.json", () => {
    const projDir = join(dir, "proj-w");
    mkdirSync(join(projDir, "s_1"), { recursive: true });
    mkdirSync(join(projDir, "s_2"), { recursive: true });
    writeFileSync(join(projDir, "s_1", "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(projDir, "s_2", "session.json"), "not valid json {{{");

    const result = countProjectSessions(dir, "proj-w");
    expect(result.total).toBe(1);
    expect(result.by_status.running).toBe(1);
  });
});

// ─── projectResponse ───────────────────────────────────────────────────────────

describe("projectResponse", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-project-response-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const makeProject = (overrides: Partial<{
    id: string; absPath: string; name: string; status: "ready" | "setup_pending" | "archived";
    addedAt: string; lastActiveAt: string | null; updatedAt: string;
    workspaceMemberships: ReadonlyArray<{ workspaceId: string; role: ProjectWorkspaceRole; addedAt: string }>;
  }> = {}) => ({
    id: "proj-123",
    absPath: "/home/user/my-project",
    name: "my-project",
    status: "ready" as const,
    addedAt: "2024-01-01T00:00:00.000Z",
    lastActiveAt: "2024-01-02T00:00:00.000Z" as string | null,
    updatedAt: "2024-01-03T00:00:00.000Z",
    workspaceMemberships: [] as ReadonlyArray<{ readonly workspaceId: string; readonly role: "primary" | "supporting" | "dependency" | "experiment"; readonly addedAt: string }>,
    ...overrides,
  });

  test("maps all required fields with _v=1 envelope", () => {
    const result = projectResponse(makeProject(), dir);
    expect(result).toMatchObject({
      _v: 1,
      id: "proj-123",
      abs_path: "/home/user/my-project",
      name: "my-project",
      status: "ready",
      workspace_ids: [],
      added_at: "2024-01-01T00:00:00.000Z",
      last_active_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-03T00:00:00.000Z",
    });
  });

  test("uses canonical snake_case field names", () => {
    const result = projectResponse(makeProject({ id: "x", absPath: "/a", name: "A", status: "setup_pending" as const }), dir) as Record<string, unknown>;
    expect(result).toHaveProperty("abs_path");
    expect(result).not.toHaveProperty("absPath");
    expect(result).toHaveProperty("last_active_at");
    expect(result).not.toHaveProperty("lastActiveAt");
    expect(result).toHaveProperty("updated_at");
    expect(result).not.toHaveProperty("updatedAt");
  });

  test("returns a plain object that is JSON serializable", () => {
    const result = projectResponse(makeProject({ id: "x", name: "A", status: "archived" as const }), dir);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.keys(result).sort()).toEqual(
      ["_v", "id", "abs_path", "name", "status", "workspace_ids", "added_at", "last_active_at", "updated_at", "session_counts"].sort(),
    );
  });

  test("passes through all status values from VALID_STATUSES", () => {
    for (const status of VALID_STATUSES) {
      const result = projectResponse(makeProject({ status }), dir);
      expect(result.status).toBe(status);
    }
  });

  test("returns a new object each call (no mutation risk)", () => {
    const result1 = projectResponse(makeProject(), dir);
    const result2 = projectResponse(makeProject(), dir);
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });

  test("maps workspace_ids from workspaceMemberships", () => {
    const project = makeProject({
      workspaceMemberships: [
        { workspaceId: "w1", role: "primary", addedAt: "2024-01-01T00:00:00.000Z" },
        { workspaceId: "w2", role: "supporting", addedAt: "2024-01-02T00:00:00.000Z" },
      ],
    });
    const result = projectResponse(project, dir) as Record<string, unknown>;
    expect(result.workspace_ids).toEqual(["w1", "w2"]);
  });

  test("accepts sessionsDir as a function (lazy evaluation)", () => {
    const projDir = join(dir, "proj-123");
    mkdirSync(join(projDir, "s_1"), { recursive: true });
    writeFileSync(join(projDir, "s_1", "session.json"), JSON.stringify({ status: "running" }));

    const sessionsDirFn = () => dir;
    const result = projectResponse(makeProject(), sessionsDirFn) as Record<string, unknown>;
    expect(result.session_counts).toEqual({ total: 1, by_status: { running: 1 } });
  });

  test("includes session_counts from countProjectSessions", () => {
    // Create a project with known sessions
    const projDir = join(dir, "proj-123");
    mkdirSync(join(projDir, "s_1"), { recursive: true });
    mkdirSync(join(projDir, "s_2"), { recursive: true });
    writeFileSync(join(projDir, "s_1", "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(projDir, "s_2", "session.json"), JSON.stringify({ status: "completed" }));

    const result = projectResponse(makeProject(), dir) as Record<string, unknown>;
    expect(result.session_counts).toEqual({ total: 2, by_status: { running: 1, completed: 1 } });
  });
});
