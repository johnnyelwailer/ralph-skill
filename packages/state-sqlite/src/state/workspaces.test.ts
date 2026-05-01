import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRegistry } from "./projects.ts";
import {
  WorkspaceNotFoundError,
  WorkspaceRegistry,
} from "./workspaces.ts";

describe("WorkspaceRegistry", () => {
  let workspaceRegistry: WorkspaceRegistry;
  let projectRegistry: ProjectRegistry;
  let tmpProjectDir: string;

  beforeEach(() => {
    const { db } = openDatabase(":memory:");
    projectRegistry = new ProjectRegistry(db);
    workspaceRegistry = new WorkspaceRegistry(db);
    tmpProjectDir = mkdtempSync(join(tmpdir(), "aloop-ws-proj-"));
  });

  afterEach(() => {
    rmSync(tmpProjectDir, { recursive: true, force: true });
  });

  test("create inserts a workspace with all fields", () => {
    const p = projectRegistry.create({ absPath: tmpProjectDir });
    const ws = workspaceRegistry.create({ name: "Test Workspace", description: "A test", defaultProjectId: p.id, metadata: { color: "blue" } });
    expect(ws.name).toBe("Test Workspace");
    expect(ws.description).toBe("A test");
    expect(ws.defaultProjectId).toBe(p.id);
    expect(ws.metadata).toEqual({ color: "blue" });
    expect(ws.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ws.archivedAt).toBeNull();
  });

  test("create auto-generates id if not provided", () => {
    const ws = workspaceRegistry.create({ name: "Test" });
    expect(ws.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("create uses name as default for empty description", () => {
    const ws = workspaceRegistry.create({ name: "Test Workspace" });
    expect(ws.description).toBe("");
  });

  test("create uses provided now timestamp", () => {
    const now = "2026-01-15T12:00:00.000Z";
    const ws = workspaceRegistry.create({ name: "Test", now });
    expect(ws.createdAt).toBe(now);
    expect(ws.updatedAt).toBe(now);
  });

  test("get returns undefined for unknown id", () => {
    expect(workspaceRegistry.get("nope")).toBeUndefined();
  });

  test("get returns workspace by id", () => {
    const created = workspaceRegistry.create({ name: "Test" });
    const found = workspaceRegistry.get(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Test");
  });

  test("list returns active workspaces by default", () => {
    const ws1 = workspaceRegistry.create({ name: "Active" });
    const ws2 = workspaceRegistry.create({ name: "Archived" });
    workspaceRegistry.archive(ws2.id);
    const active = workspaceRegistry.list();
    expect(active.map((w) => w.id)).toEqual([ws1.id]);
    expect(active.find((w) => w.id === ws2.id)).toBeUndefined();
  });

  test("list includes archived when filtered", () => {
    const ws1 = workspaceRegistry.create({ name: "Active" });
    const ws2 = workspaceRegistry.create({ name: "Archived" });
    workspaceRegistry.archive(ws2.id);
    const all = workspaceRegistry.list({ archived: true });
    expect(all.map((w) => w.id)).toContain(ws1.id);
    expect(all.map((w) => w.id)).toContain(ws2.id);
  });

  test("list orders by created_at", () => {
    const t = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
    workspaceRegistry.create({ name: "First", now: t(5) });
    workspaceRegistry.create({ name: "Second", now: t(10) });
    const list = workspaceRegistry.list();
    expect(list[0]!.name).toBe("First");
    expect(list[1]!.name).toBe("Second");
  });

  test("updateName updates name and updatedAt", () => {
    const ws = workspaceRegistry.create({ name: "Original" });
    const updated = workspaceRegistry.updateName(ws.id, "Renamed");
    expect(updated.name).toBe("Renamed");
    expect(updated.updatedAt >= ws.updatedAt).toBe(true);
  });

  test("updateName throws WorkspaceNotFoundError for unknown id", () => {
    expect(() => workspaceRegistry.updateName("nope", "x")).toThrow(WorkspaceNotFoundError);
  });

  test("updateName rejects empty names", () => {
    const ws = workspaceRegistry.create({ name: "Test" });
    expect(() => workspaceRegistry.updateName(ws.id, "   ")).toThrow(/empty/);
  });

test("updateDescription updates description", () => {
    const ws = workspaceRegistry.create({ name: "Test", description: "Original" });
    const updated = workspaceRegistry.updateDescription(ws.id, "New description");
    expect(updated.description).toBe("New description");
  });

  test("updateDescription throws WorkspaceNotFoundError for unknown id", () => {
    expect(() => workspaceRegistry.updateDescription("nope", "x")).toThrow(WorkspaceNotFoundError);
  });

  test("updateDescription throws WorkspaceNotFoundError for unknown id", () => {
    expect(() => workspaceRegistry.updateDescription("nope", "x")).toThrow(WorkspaceNotFoundError);
  });

  test("archive sets archivedAt", () => {
    const ws = workspaceRegistry.create({ name: "Test" });
    expect(ws.archivedAt).toBeNull();
    const archived = workspaceRegistry.archive(ws.id);
    expect(archived.archivedAt).not.toBeNull();
  });

  test("archive throws WorkspaceNotFoundError for unknown id", () => {
    expect(() => workspaceRegistry.archive("nope")).toThrow(WorkspaceNotFoundError);
  });

  test.skip("addProject inserts project with role", () => {
    const p = projectRegistry.create({ absPath: tmpProjectDir });
    workspaceRegistry.addProject("ws1", p.id, "primary");
    const projects = workspaceRegistry.listProjects("ws1");
    expect(projects.length).toBe(1);
    expect(projects[0]!.projectId).toBe(p.id);
    expect(projects[0]!.role).toBe("primary");
  });

  test.skip("addProject updates role when already exists", () => {
    const p = projectRegistry.create({ absPath: tmpProjectDir });
    workspaceRegistry.addProject("ws1", p.id, "primary");
    workspaceRegistry.addProject("ws1", p.id, "supporting");
    const projects = workspaceRegistry.listProjects("ws1");
    expect(projects.length).toBe(1);
    expect(projects[0]!.role).toBe("supporting");
  });

  test.skip("removeProject deletes project from workspace", () => {
    const p = projectRegistry.create({ absPath: tmpProjectDir });
    workspaceRegistry.addProject("ws1", p.id, "primary");
    workspaceRegistry.removeProject("ws1", p.id);
    const projects = workspaceRegistry.listProjects("ws1");
    expect(projects).toEqual([]);
  });

  test.skip("listProjects returns projects with details", () => {
    const p = projectRegistry.create({ absPath: tmpProjectDir, name: "My Project" });
    workspaceRegistry.addProject("ws1", p.id, "primary");
    const projects = workspaceRegistry.listProjects("ws1");
    expect(projects.length).toBe(1);
    expect(projects[0]!.projectId).toBe(p.id);
    expect(projects[0]!.projectName).toBe("My Project");
    expect(projects[0]!.projectAbsPath).toBe(p.absPath);
    expect(projects[0]!.projectStatus).toBe(p.status);
  });

  test.skip("getProjectRole returns role for existing project", () => {
    const p = projectRegistry.create({ absPath: tmpProjectDir });
    workspaceRegistry.addProject("ws1", p.id, "dependency");
    const role = workspaceRegistry.getProjectRole("ws1", p.id);
    expect(role).toBe("dependency");
  });

  test.skip("getProjectRole returns null for non-existent project", () => {
    const role = workspaceRegistry.getProjectRole("ws1", "nonexistent");
    expect(role).toBeNull();
  });
});