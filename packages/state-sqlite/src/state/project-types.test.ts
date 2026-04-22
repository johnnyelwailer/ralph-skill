import { describe, expect, test } from "bun:test";
import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
} from "./project-types.ts";

describe("ProjectNotFoundError", () => {
  test("code is project_not_found", () => {
    const err = new ProjectNotFoundError("proj_abc123");
    expect(err.code).toBe("project_not_found");
  });

  test("id is set from constructor argument", () => {
    const err = new ProjectNotFoundError("proj_abc123");
    expect(err.id).toBe("proj_abc123");
  });

  test("message includes the id", () => {
    const err = new ProjectNotFoundError("proj_abc123");
    expect(err.message).toBe("project not found: proj_abc123");
  });



  test("is an instance of Error", () => {
    const err = new ProjectNotFoundError("proj_abc123");
    expect(err instanceof Error).toBe(true);
  });

  test("different ids produce different messages", () => {
    const err1 = new ProjectNotFoundError("proj_one");
    const err2 = new ProjectNotFoundError("proj_two");
    expect(err1.message).not.toBe(err2.message);
    expect(err1.id).not.toBe(err2.id);
  });
});

describe("ProjectAlreadyRegisteredError", () => {
  test("code is project_already_registered", () => {
    const err = new ProjectAlreadyRegisteredError("/home/user/myproject");
    expect(err.code).toBe("project_already_registered");
  });

  test("absPath is set from constructor argument", () => {
    const err = new ProjectAlreadyRegisteredError("/home/user/myproject");
    expect(err.absPath).toBe("/home/user/myproject");
  });

  test("message includes the absPath", () => {
    const err = new ProjectAlreadyRegisteredError("/home/user/myproject");
    expect(err.message).toBe("project already registered at path: /home/user/myproject");
  });



  test("is an instance of Error", () => {
    const err = new ProjectAlreadyRegisteredError("/home/user/myproject");
    expect(err instanceof Error).toBe(true);
  });

  test("different paths produce different messages", () => {
    const err1 = new ProjectAlreadyRegisteredError("/path/one");
    const err2 = new ProjectAlreadyRegisteredError("/path/two");
    expect(err1.message).not.toBe(err2.message);
    expect(err1.absPath).not.toBe(err2.absPath);
  });
});
