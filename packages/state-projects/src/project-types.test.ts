import { describe, expect, test } from "bun:test";
import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type CreateProjectInput,
  type Project,
  type ProjectFilter,
  type ProjectStatus,
} from "./project-types.ts";

describe("ProjectStatus", () => {
  test("exposes the three valid status literals", () => {
    const statuses: ProjectStatus[] = ["setup_pending", "ready", "archived"];
    expect(statuses).toBeDefined();
  });
});

describe("Project", () => {
  test("has the expected readonly shape", () => {
    const project: Project = {
      id: "proj_1",
      absPath: "/tmp/project",
      name: "My Project",
      status: "ready",
      addedAt: "2024-01-01T00:00:00Z",
      lastActiveAt: "2024-06-15T12:00:00Z",
      updatedAt: "2024-06-15T12:00:00Z",
    };
    expect(project.id).toBe("proj_1");
    expect(project.status).toBe("ready");
    expect(project.lastActiveAt).not.toBeNull();
  });

  test("lastActiveAt can be null", () => {
    const project: Project = {
      id: "proj_2",
      absPath: "/tmp/project2",
      name: "New Project",
      status: "setup_pending",
      addedAt: "2024-01-01T00:00:00Z",
      lastActiveAt: null,
      updatedAt: "2024-01-01T00:00:00Z",
    };
    expect(project.lastActiveAt).toBeNull();
  });
});

describe("ProjectFilter", () => {
  test("status filter narrows results", () => {
    const filter: ProjectFilter = { status: "ready" };
    expect(filter.status).toBe("ready");
    expect(filter.absPath).toBeUndefined();
  });

  test("absPath filter narrows results", () => {
    const filter: ProjectFilter = { absPath: "/tmp/specific" };
    expect(filter.absPath).toBe("/tmp/specific");
    expect(filter.status).toBeUndefined();
  });

  test("both filters can be applied together", () => {
    const filter: ProjectFilter = { status: "archived", absPath: "/tmp/archived" };
    expect(filter.status).toBe("archived");
    expect(filter.absPath).toBe("/tmp/archived");
  });

  test("empty filter is valid", () => {
    const filter: ProjectFilter = {};
    expect(filter.status).toBeUndefined();
    expect(filter.absPath).toBeUndefined();
  });
});

describe("CreateProjectInput", () => {
  test("required absPath only", () => {
    const input: CreateProjectInput = { absPath: "/tmp/new-project" };
    expect(input.absPath).toBe("/tmp/new-project");
    expect(input.name).toBeUndefined();
    expect(input.id).toBeUndefined();
  });

  test("all optional fields", () => {
    const input: CreateProjectInput = {
      absPath: "/tmp/new-project",
      name: "My New Project",
      id: "proj_custom_id",
      now: "2024-07-01T00:00:00Z",
    };
    expect(input.name).toBe("My New Project");
    expect(input.id).toBe("proj_custom_id");
    expect(input.now).toBe("2024-07-01T00:00:00Z");
  });
});

describe("ProjectNotFoundError", () => {
  test("code is project_not_found", () => {
    const err = new ProjectNotFoundError("proj_abc");
    expect(err.code).toBe("project_not_found");
  });

  test("message includes the id", () => {
    const err = new ProjectNotFoundError("proj_abc");
    expect(err.message).toBe("project not found: proj_abc");
  });

  test("id property is accessible", () => {
    const err = new ProjectNotFoundError("proj_xyz");
    expect(err.id).toBe("proj_xyz");
  });

  test("is an Error instance", () => {
    const err = new ProjectNotFoundError("proj_1");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProjectNotFoundError);
  });

  test("stack trace is present", () => {
    const err = new ProjectNotFoundError("proj_1");
    expect(typeof err.stack).toBe("string");
  });
});

describe("ProjectAlreadyRegisteredError", () => {
  test("code is project_already_registered", () => {
    const err = new ProjectAlreadyRegisteredError("/tmp/duplicate");
    expect(err.code).toBe("project_already_registered");
  });

  test("message includes the path", () => {
    const err = new ProjectAlreadyRegisteredError("/tmp/duplicate");
    expect(err.message).toBe("project already registered at path: /tmp/duplicate");
  });

  test("absPath property is accessible", () => {
    const err = new ProjectAlreadyRegisteredError("/home/user/project");
    expect(err.absPath).toBe("/home/user/project");
  });

  test("is an Error instance", () => {
    const err = new ProjectAlreadyRegisteredError("/tmp/dup");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProjectAlreadyRegisteredError);
  });

  test("stack trace is present", () => {
    const err = new ProjectAlreadyRegisteredError("/tmp/dup");
    expect(typeof err.stack).toBe("string");
  });
});
