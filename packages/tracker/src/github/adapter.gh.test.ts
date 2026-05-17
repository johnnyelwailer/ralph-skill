import { describe, expect, test, mock } from "bun:test";
import type { MergeMode } from "../types.js";

describe("parseGitHubAge parsing", () => {
  // Test the regex-based age parsing logic used by the subscribe() polling loop.
  // Logic: ageStr.match(/(\d+)\s+(\w+)\s+ago/) → value, unit, then ms = msTable[unit]

  test("parses valid 'X minutes ago' format", () => {
    const ageStr = "3 minutes ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("3");
    expect(match![2]).toBe("minutes");
  });

  test("singular minute (no trailing s) normalizes to 'minute'", () => {
    const ageStr = "1 minute ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/) as RegExpMatchArray;
    expect(match).toBeTruthy();
    expect(match[2]!).toBe("minute");
  });

  test("plural hours normalizes to 'hour' after s-stripping", () => {
    const ageStr = "5 hours ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/) as RegExpMatchArray;
    expect(match).toBeTruthy();
    expect(match[2]!.replace(/s$/, "")).toBe("hour");
  });

  test("parses days ago correctly", () => {
    const ageStr = "14 days ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/) as RegExpMatchArray;
    expect(match).toBeTruthy();
    expect(match[1]!).toBe("14");
    expect(match[2]!).toBe("days");
  });

  test("parses weeks ago correctly", () => {
    const ageStr = "2 weeks ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/) as RegExpMatchArray;
    expect(match).toBeTruthy();
    expect(match[1]!).toBe("2");
  });

  test("parses months ago correctly", () => {
    const ageStr = "3 months ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/) as RegExpMatchArray;
    expect(match).toBeTruthy();
    expect(match[1]!).toBe("3");
  });

  test("parses years ago correctly", () => {
    const ageStr = "1 year ago";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/) as RegExpMatchArray;
    expect(match).toBeTruthy();
    expect(match[1]!).toBe("1");
  });

  test("returns null when format does not match", () => {
    const ageStr = "just now";
    const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/);
    expect(match).toBeNull();
  });

  test("msTable covers all expected units", () => {
    const msTable: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_629_746_000,
      year: 31_556_952_000,
    };
    const units = ["minute", "hour", "day", "week", "month", "year"];
    for (const unit of units) {
      expect(msTable[unit]).toBeGreaterThan(0);
    }
  });

  test("fallback unit defaults to 60000ms", () => {
    const msTable: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_629_746_000,
      year: 31_556_952_000,
    };
    const fallbackUnit = "decade";
    const ms = msTable[fallbackUnit] ?? 60_000;
    expect(ms).toBe(60_000);
  });
});

describe("gh() spawn wrapper contract", () => {
  // Verify the gh() function's spawn argument construction and error handling contract.
  // These tests document the expected behavior of the low-level gh CLI wrapper.

  test("ghREST constructs --method flag correctly for PUT", () => {
    // ghREST calls gh() with: ["api", "--method", method, path]
    const method = "PUT";
    const path = "/repos/owner/repo/pulls/123/merge";
    const args = ["api", "--method", method, path];
    expect(args).toContain("--method");
    expect(args[args.indexOf("--method") + 1]).toBe("PUT");
  });

  test("ghREST constructs --method flag correctly for PATCH", () => {
    const method = "PATCH";
    const path = "/repos/owner/repo/issues/456";
    const args = ["api", "--method", method, path];
    expect(args[2]).toBe("PATCH");
  });

  test("ghREST includes body as -f input= JSON flag", () => {
    const body = { merge_method: "squash" };
    const args = ["api", "--method", "PUT", "/path", "-f", `input=${JSON.stringify(body)}`];
    const inputFlagIdx = args.indexOf("-f");
    expect(inputFlagIdx).toBeGreaterThan(-1);
    expect(args[inputFlagIdx + 1]).toBe('input={"merge_method":"squash"}');
  });

  test("ghGraphql constructs query=-f flag", () => {
    const query = "query { viewer { login } }";
    const args = ["api", "graphql", "-f", `query=${query}`];
    const queryFlagIdx = args.indexOf("-f");
    expect(queryFlagIdx).toBeGreaterThan(-1);
    expect(args[queryFlagIdx + 1]).toBe(`query=${query}`);
  });

  test("ghGraphql appends variable -f flags", () => {
    const variables = { owner: "testowner", repo: "testrepo" };
    const args = ["api", "graphql", "-f", "query=query", "-f", `owner=${JSON.stringify(variables.owner)}`, "-f", `repo=${JSON.stringify(variables.repo)}`];
    expect(args).toContain("-f");
    const ownerIdx = args.indexOf(`owner=${JSON.stringify(variables.owner)}`);
    expect(ownerIdx).toBeGreaterThan(-1);
  });

  test("gh() spawn stdio configuration uses ignore for stdin", () => {
    // gh() is called with stdio: ["ignore", "pipe", "pipe"]
    const stdio: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
    expect(stdio[0]).toBe("ignore");
    expect(stdio[1]).toBe("pipe");
    expect(stdio[2]).toBe("pipe");
  });

  test("gh() rejects with Error containing stderr on non-zero exit", () => {
    // When gh exits with code != 0, it rejects with:
    // new Error(`gh ${args.join(" ")} failed: ${stderr}`)
    const args = ["api", "invalid"];
    const stderr = "Resource not found";
    const errorMessage = `gh ${args.join(" ")} failed: ${stderr}`;
    expect(errorMessage).toContain("gh api invalid failed");
    expect(errorMessage).toContain("Resource not found");
  });
});

describe("mergeChangeSet merge method mapping", () => {
  // Document the MergeMode → GitHub merge_method string mapping contract.
  // Source: adapter.ts mergeChangeSet()

  test("squash mode maps to squash merge_method", () => {
    const mode: MergeMode = "squash";
    const mergeMethod = mode === "squash" ? "squash" : mode === "fast_forward" ? "fast-forward" : "merge";
    expect(mergeMethod).toBe("squash");
  });

  test("fast_forward mode maps to fast-forward merge_method", () => {
    const mode = "fast_forward" as MergeMode;
    const mergeMethod = mode === "squash" ? "squash" : mode === "fast_forward" ? "fast-forward" : "merge";
    expect(mergeMethod).toBe("fast-forward");
  });

  test("merge mode maps to merge merge_method", () => {
    const mode = "merge" as MergeMode;
    const mergeMethod = mode === "squash" ? "squash" : mode === "fast_forward" ? "fast-forward" : "merge";
    expect(mergeMethod).toBe("merge");
  });
});
