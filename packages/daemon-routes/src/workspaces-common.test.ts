import { describe, expect, test } from "bun:test";
import {
  parseWorkspaceFilter,
  VALID_ROLES,
  workspaceResponse,
  type Role,
} from "./workspaces-common.ts";
import type { WorkspaceFilter, WorkspaceWithCounts } from "@aloop/state-projects";

describe("parseWorkspaceFilter", () => {
  test("returns empty filter when no query params", () => {
    const url = new URL("http://localhost/v1/workspaces");
    const filter = parseWorkspaceFilter(url);
    expect(filter).toEqual<WorkspaceFilter>({});
  });

  test("parses q param", () => {
    const url = new URL("http://localhost/v1/workspaces?q=platform");
    const filter = parseWorkspaceFilter(url);
    expect(filter.q).toBe("platform");
  });

  test("parses limit param as number", () => {
    const url = new URL("http://localhost/v1/workspaces?limit=10");
    const filter = parseWorkspaceFilter(url);
    expect(filter.limit).toBe(10);
  });

  test("parses cursor param", () => {
    const url = new URL("http://localhost/v1/workspaces?cursor=w_abc123");
    const filter = parseWorkspaceFilter(url);
    expect(filter.cursor).toBe("w_abc123");
  });

  test("combines all params", () => {
    const url = new URL("http://localhost/v1/workspaces?q=team&limit=25&cursor=w_xyz");
    const filter = parseWorkspaceFilter(url);
    expect(filter).toEqual<WorkspaceFilter>({
      q: "team",
      limit: 25,
      cursor: "w_xyz",
    });
  });

  test("omits params that are not present", () => {
    const url = new URL("http://localhost/v1/workspaces?limit=5");
    const filter = parseWorkspaceFilter(url);
    expect(filter.q).toBeUndefined();
    expect(filter.cursor).toBeUndefined();
    expect(filter.limit).toBe(5);
  });
});

describe("VALID_ROLES", () => {
  test("contains all four workspace project roles", () => {
    expect(VALID_ROLES).toHaveLength(4);
    expect(VALID_ROLES).toContain("primary");
    expect(VALID_ROLES).toContain("supporting");
    expect(VALID_ROLES).toContain("dependency");
    expect(VALID_ROLES).toContain("experiment");
  });

  test("values are all lowercase and match Role type", () => {
    const roles: Role[] = ["primary", "supporting", "dependency", "experiment"];
    for (const role of roles) {
      expect(VALID_ROLES).toContain(role);
    }
  });
});

describe("Role type", () => {
  test("accepts each valid role value", () => {
    const roles: Role[] = ["primary", "supporting", "dependency", "experiment"];
    for (const role of roles) {
      expect(VALID_ROLES).toContain(role);
    }
  });
});

// ─── workspaceResponse ─────────────────────────────────────────────────────────

describe("workspaceResponse", () => {
  // Minimal WorkspaceWithCounts mock matching the @aloop/state-projects shape
  function makeWorkspaceWithCounts(
    overrides: Partial<{
      id: string;
      name: string;
      description: string;
      defaultBudgetUsdPerDay: number;
      metadata: Record<string, unknown>;
      defaultProjectId: string | null;
      projectCounts: { total: number; primary: number; supporting: number; dependency: number; experiment: number };
      createdAt: string;
      updatedAt: string;
    }> = {},
  ): WorkspaceWithCounts {
    return {
      id: "w_abc123",
      name: "Platform Team",
      description: "Core platform infrastructure",
      defaultBudgetUsdPerDay: 50,
      metadata: { region: "us-east-1" },
      defaultProjectId: "proj_default",
      projectCounts: { total: 3, primary: 1, supporting: 1, dependency: 1, experiment: 0 },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-15T12:30:00.000Z",
      ...overrides,
    } as WorkspaceWithCounts;
  }

  test("returns _v=1 envelope with all required fields", () => {
    const w = makeWorkspaceWithCounts();
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result._v).toBe(1);
    expect(result.id).toBe("w_abc123");
    expect(result.name).toBe("Platform Team");
    expect(result.description).toBe("Core platform infrastructure");
    expect(result.created_at).toBe("2024-01-01T00:00:00.000Z");
    expect(result.updated_at).toBe("2024-06-15T12:30:00.000Z");
  });

  test("maps default_budget_usd_per_day from defaultBudgetUsdPerDay", () => {
    const w = makeWorkspaceWithCounts({ defaultBudgetUsdPerDay: 100 });
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result.default_budget_usd_per_day).toBe(100);
  });

  test("maps metadata field as-is", () => {
    const w = makeWorkspaceWithCounts({ metadata: { env: "prod", version: 2 } });
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result.metadata).toEqual({ env: "prod", version: 2 });
  });

  test("maps default_project_id from defaultProjectId (null case)", () => {
    const w = makeWorkspaceWithCounts({ defaultProjectId: null });
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result.default_project_id).toBeNull();
  });

  test("maps default_project_id from defaultProjectId (string case)", () => {
    const w = makeWorkspaceWithCounts({ defaultProjectId: "proj_xyz" });
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result.default_project_id).toBe("proj_xyz");
  });

  test("maps project_counts with all role breakdown fields", () => {
    const w = makeWorkspaceWithCounts({
      projectCounts: { total: 5, primary: 2, supporting: 1, dependency: 1, experiment: 1 },
    });
    const result = workspaceResponse(w) as Record<string, unknown>;
    const counts = result.project_counts as Record<string, number>;
    expect(counts.total).toBe(5);
    expect(counts.primary).toBe(2);
    expect(counts.supporting).toBe(1);
    expect(counts.dependency).toBe(1);
    expect(counts.experiment).toBe(1);
  });

  test("uses canonical snake_case field names (no camelCase in output)", () => {
    const w = makeWorkspaceWithCounts();
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result).toHaveProperty("default_budget_usd_per_day");
    expect(result).not.toHaveProperty("defaultBudgetUsdPerDay");
    expect(result).toHaveProperty("default_project_id");
    expect(result).not.toHaveProperty("defaultProjectId");
    expect(result).toHaveProperty("created_at");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).toHaveProperty("updated_at");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).toHaveProperty("project_counts");
    expect(result).not.toHaveProperty("projectCounts");
  });

  test("returns a plain object that is JSON serializable", () => {
    const w = makeWorkspaceWithCounts();
    const result = workspaceResponse(w);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test("returns a new object each call (no mutation risk)", () => {
    const w = makeWorkspaceWithCounts();
    const r1 = workspaceResponse(w);
    const r2 = workspaceResponse(w);
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });

  test("handles zero values in project_counts", () => {
    const w = makeWorkspaceWithCounts({ projectCounts: { total: 0, primary: 0, supporting: 0, dependency: 0, experiment: 0 } });
    const result = workspaceResponse(w) as Record<string, unknown>;
    const counts = result.project_counts as Record<string, number>;
    expect(counts.total).toBe(0);
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
  });

  test("handles empty metadata object", () => {
    const w = makeWorkspaceWithCounts({ metadata: {} });
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result.metadata).toEqual({});
  });

  test("handles whitespace in name and description", () => {
    const w = makeWorkspaceWithCounts({ name: "  Spacy Name  ", description: "  Has leading/trailing spaces  " });
    const result = workspaceResponse(w) as Record<string, unknown>;
    expect(result.name).toBe("  Spacy Name  ");
    expect(result.description).toBe("  Has leading/trailing spaces  ");
  });
});
