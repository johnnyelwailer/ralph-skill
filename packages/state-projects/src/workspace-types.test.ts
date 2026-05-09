import { describe, expect, test } from "bun:test";
import {
  type Workspace,
  type WorkspaceProject,
  type WorkspaceProjectCounts,
  type WorkspaceProjectRole,
  type WorkspaceWithCounts,
  WorkspaceNotFoundError,
  DuplicateWorkspaceProjectError,
} from "./workspace-types.ts";

describe("Workspace", () => {
  test("has the expected readonly shape", () => {
    const w: Workspace = {
      id: "w_01",
      name: "Aloop",
      description: "Harness product",
      defaultBudgetUsdPerDay: 25.0,
      metadata: {},
      createdAt: "2026-05-01T10:00:00Z",
      updatedAt: "2026-05-01T10:00:00Z",
    };
    expect(w.id).toBe("w_01");
    expect(w.name).toBe("Aloop");
    expect(w.description).toBe("Harness product");
    expect(w.defaultBudgetUsdPerDay).toBe(25.0);
    expect(w.metadata).toEqual({});
    expect(w.createdAt).toBe("2026-05-01T10:00:00Z");
    expect(w.updatedAt).toBe("2026-05-01T10:00:00Z");
  });

  test("metadata can hold arbitrary fields", () => {
    const w: Workspace = {
      id: "w_01",
      name: "Test",
      description: "",
      defaultBudgetUsdPerDay: 0,
      metadata: { team: "platform", tags: ["alpha"] },
      createdAt: "2026-05-01T10:00:00Z",
      updatedAt: "2026-05-01T10:00:00Z",
    };
    expect(w.metadata.team).toBe("platform");
    expect(w.metadata.tags).toEqual(["alpha"]);
  });
});

describe("WorkspaceProject", () => {
  test("has the expected readonly shape", () => {
    const wp: WorkspaceProject = {
      workspaceId: "w_01",
      projectId: "p_01",
      role: "primary",
      addedAt: "2026-05-01T10:00:00Z",
    };
    expect(wp.workspaceId).toBe("w_01");
    expect(wp.projectId).toBe("p_01");
    expect(wp.role).toBe("primary");
    expect(wp.addedAt).toBe("2026-05-01T10:00:00Z");
  });

  test("role accepts all four variants", () => {
    const roles: WorkspaceProjectRole[] = [
      "primary",
      "supporting",
      "dependency",
      "experiment",
    ];
    for (const role of roles) {
      const wp: WorkspaceProject = {
        workspaceId: "w_01",
        projectId: "p_01",
        role,
        addedAt: "2026-05-01T10:00:00Z",
      };
      expect(wp.role).toBe(role);
    }
  });
});

describe("WorkspaceProjectCounts", () => {
  test("has the expected shape", () => {
    const counts: WorkspaceProjectCounts = {
      total: 10,
      primary: 2,
      supporting: 5,
      dependency: 2,
      experiment: 1,
    };
    expect(counts.total).toBe(10);
    expect(counts.primary).toBe(2);
    expect(counts.supporting).toBe(5);
    expect(counts.dependency).toBe(2);
    expect(counts.experiment).toBe(1);
  });
});

describe("WorkspaceWithCounts", () => {
  test("combines Workspace with counts", () => {
    const wwc: WorkspaceWithCounts = {
      id: "w_01",
      name: "Aloop",
      description: "Harness",
      defaultBudgetUsdPerDay: 25.0,
      metadata: {},
      createdAt: "2026-05-01T10:00:00Z",
      updatedAt: "2026-05-01T10:00:00Z",
      defaultProjectId: "p_01",
      projectCounts: {
        total: 3,
        primary: 1,
        supporting: 1,
        dependency: 1,
        experiment: 0,
      },
    };
    expect(wwc.defaultProjectId).toBe("p_01");
    expect(wwc.projectCounts.total).toBe(3);
  });
});

describe("WorkspaceNotFoundError", () => {
  test("code is workspace_not_found", () => {
    const err = new WorkspaceNotFoundError("w_xyz");
    expect(err.code).toBe("workspace_not_found");
    expect(err.message).toContain("w_xyz");
    expect(err.id).toBe("w_xyz");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("DuplicateWorkspaceProjectError", () => {
  test("code is duplicate_workspace_project", () => {
    const err = new DuplicateWorkspaceProjectError("w_01", "p_01");
    expect(err.code).toBe("duplicate_workspace_project");
    expect(err.message).toContain("w_01");
    expect(err.message).toContain("p_01");
    expect(err.workspaceId).toBe("w_01");
    expect(err.projectId).toBe("p_01");
    expect(err).toBeInstanceOf(Error);
  });
});
