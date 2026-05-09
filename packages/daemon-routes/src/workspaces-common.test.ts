import { describe, expect, test } from "bun:test";
import {
  parseWorkspaceFilter,
  VALID_ROLES,
  type Role,
} from "./workspaces-common.ts";
import type { WorkspaceFilter } from "@aloop/state-projects";

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
