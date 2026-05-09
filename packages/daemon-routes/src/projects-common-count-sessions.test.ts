import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { countProjectSessions } from "./projects-common.ts";

describe("countProjectSessions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-count-sessions-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns { total: 0, by_status: {} } when project sessions directory does not exist", () => {
    const result = countProjectSessions(dir, "no-such-project");
    expect(result).toEqual({ total: 0, by_status: {} });
  });

  test("returns { total: 0, by_status: {} } when project directory exists but is empty", () => {
    const projectDir = join(dir, "proj-no-sessions");
    mkdirSync(projectDir, { recursive: true });

    const result = countProjectSessions(dir, "proj-no-sessions");
    expect(result).toEqual({ total: 0, by_status: {} });
  });

  // Per implementation: session directories without session.json are silently skipped
  // (the catch block calls continue, so total is not incremented).
  // This means empty session dirs are invisible to the count.
  test("skips session directories without session.json (they are invisible to count)", () => {
    const projectId = "proj-empty-sessions";
    const projectDir = join(dir, projectId);
    mkdirSync(join(projectDir, "s_session1"), { recursive: true });
    mkdirSync(join(projectDir, "s_session2"), { recursive: true });
    mkdirSync(join(projectDir, "s_session3"), { recursive: true });

    const result = countProjectSessions(dir, projectId);
    expect(result.total).toBe(0);
    expect(result.by_status).toEqual({});
  });

  test("reads session.json to determine status and groups by status", () => {
    const projectId = "proj-with-status";
    const projectDir = join(dir, projectId);
    mkdirSync(join(projectDir, "s_running"), { recursive: true });
    mkdirSync(join(projectDir, "s_completed"), { recursive: true });
    mkdirSync(join(projectDir, "s_running2"), { recursive: true });

    writeFileSync(join(projectDir, "s_running", "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(projectDir, "s_completed", "session.json"), JSON.stringify({ status: "completed" }));
    writeFileSync(join(projectDir, "s_running2", "session.json"), JSON.stringify({ status: "running" }));

    const result = countProjectSessions(dir, projectId);
    expect(result.total).toBe(3);
    expect(result.by_status).toEqual({ running: 2, completed: 1 });
  });

  // Per implementation: malformed session.json throws, the catch calls continue,
  // so those directories are skipped and do not appear in the count.
  test("skips directories with malformed session.json", () => {
    const projectId = "proj-malformed";
    const projectDir = join(dir, projectId);
    mkdirSync(join(projectDir, "s_good"), { recursive: true });
    mkdirSync(join(projectDir, "s_bad"), { recursive: true });

    writeFileSync(join(projectDir, "s_good", "session.json"), JSON.stringify({ status: "completed" }));
    writeFileSync(join(projectDir, "s_bad", "session.json"), "not valid json{");

    const result = countProjectSessions(dir, projectId);
    // The malformed file causes the catch to continue (skips this dir), so only the good one counts.
    expect(result.total).toBe(1);
    expect(result.by_status).toEqual({ completed: 1 });
  });

  test("skips entries that are not session directories (do not start with s_)", () => {
    const projectId = "proj-mixed";
    const projectDir = join(dir, projectId);
    mkdirSync(join(projectDir, "s_valid"), { recursive: true });
    mkdirSync(join(projectDir, "not-a-session"), { recursive: true });
    mkdirSync(join(projectDir, "s_another"), { recursive: true });

    writeFileSync(join(projectDir, "s_valid", "session.json"), JSON.stringify({ status: "running" }));
    writeFileSync(join(projectDir, "s_another", "session.json"), JSON.stringify({ status: "completed" }));

    const result = countProjectSessions(dir, projectId);
    expect(result.total).toBe(2);
    expect(result.by_status).toEqual({ running: 1, completed: 1 });
  });

  test("treats null status in session.json as unknown", () => {
    const projectId = "proj-null-status";
    const projectDir = join(dir, projectId);
    mkdirSync(join(projectDir, "s_null"), { recursive: true });

    writeFileSync(join(projectDir, "s_null", "session.json"), JSON.stringify({ status: null }));

    const result = countProjectSessions(dir, projectId);
    expect(result.total).toBe(1);
    expect(result.by_status).toEqual({ unknown: 1 });
  });

  test("treats missing status field in session.json as unknown", () => {
    const projectId = "proj-no-status-field";
    const projectDir = join(dir, projectId);
    mkdirSync(join(projectDir, "s_no-field"), { recursive: true });

    writeFileSync(join(projectDir, "s_no-field", "session.json"), JSON.stringify({ other_field: "value" }));

    const result = countProjectSessions(dir, projectId);
    expect(result.total).toBe(1);
    expect(result.by_status).toEqual({ unknown: 1 });
  });
});
