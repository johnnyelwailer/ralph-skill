import { describe, expect, test } from "bun:test";
import {
  canonicalizeProjectPath,
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
} from "./index.ts";

describe("canonicalizeProjectPath", () => {
  test("strips trailing slashes for non-existent paths", () => {
    expect(canonicalizeProjectPath("/tmp/nonexistent-project-path-xyz///")).toBe(
      "/tmp/nonexistent-project-path-xyz",
    );
  });
});

describe("project errors", () => {
  test("ProjectNotFoundError exposes stable code", () => {
    const err = new ProjectNotFoundError("abc");
    expect(err.code).toBe("project_not_found");
    expect(err.message).toContain("abc");
  });

  test("ProjectAlreadyRegisteredError exposes stable code", () => {
    const err = new ProjectAlreadyRegisteredError("/tmp/foo");
    expect(err.code).toBe("project_already_registered");
    expect(err.message).toContain("/tmp/foo");
  });
});
