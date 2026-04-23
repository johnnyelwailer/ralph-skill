import { describe, expect, test } from "bun:test";
import { projectResponse, VALID_STATUSES } from "./projects-common.ts";

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

describe("projectResponse", () => {
  test("maps all required fields with _v=1 envelope", () => {
    const project = {
      id: "proj-123",
      absPath: "/home/user/my-project",
      name: "my-project",
      status: "ready" as const,
      addedAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-02T00:00:00.000Z",
      updatedAt: "2024-01-03T00:00:00.000Z",
    };
    const result = projectResponse(project);
    expect(result).toEqual({
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

  test("uses canonical snake_case field names", () => {
    // absPath → abs_path
    // lastActiveAt → last_active_at
    // updatedAt → updated_at
    const project = {
      id: "x",
      absPath: "/a",
      name: "A",
      status: "setup_pending" as const,
      addedAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-02T00:00:00.000Z",
      updatedAt: "2024-01-03T00:00:00.000Z",
    };
    const result = projectResponse(project) as Record<string, unknown>;
    expect(result).toHaveProperty("abs_path");
    expect(result).not.toHaveProperty("absPath");
    expect(result).toHaveProperty("last_active_at");
    expect(result).not.toHaveProperty("lastActiveAt");
    expect(result).toHaveProperty("updated_at");
    expect(result).not.toHaveProperty("updatedAt");
  });

  test("returns a plain object that is JSON serializable", () => {
    const project = {
      id: "x",
      absPath: "/a",
      name: "A",
      status: "archived" as const,
      addedAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const result = projectResponse(project);
    // Should be JSON serializable (can round-trip through JSON.parse/stringify)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    // Should have all expected keys
    expect(Object.keys(result).sort()).toEqual(
      ["_v", "id", "abs_path", "name", "status", "added_at", "last_active_at", "updated_at"].sort(),
    );
  });

  test("passes through all status values from VALID_STATUSES", () => {
    for (const status of VALID_STATUSES) {
      const project = {
        id: "x",
        absPath: "/a",
        name: "A",
        status: status as "setup_pending" | "ready" | "archived",
        addedAt: "2024-01-01T00:00:00.000Z",
        lastActiveAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };
      const result = projectResponse(project);
      expect(result.status).toBe(status);
    }
  });

  test("returns a new object each call (no mutation risk)", () => {
    const project = {
      id: "x",
      absPath: "/a",
      name: "A",
      status: "ready" as const,
      addedAt: "2024-01-01T00:00:00.000Z",
      lastActiveAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const result1 = projectResponse(project);
    const result2 = projectResponse(project);
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);
  });
});
