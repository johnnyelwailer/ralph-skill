import { describe, expect, test } from "bun:test";
import { loadPipelineFromFile } from "./pipeline.ts";

describe("loadPipelineFromFile", () => {
  test("parses a valid pipeline.yml and returns the config", () => {
    // write a temp file and read it back
    const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");

    const dir = mkdtempSync(join(tmpdir(), "aloop-pipeline-file-"));
    const filePath = join(dir, "pipeline.yml");
    const yaml = `
pipeline:
  - agent: build
  - agent: test
    repeat: 3
finalizer:
  - cleanup
triggers:
  push: main
`;
    writeFileSync(filePath, yaml, "utf-8");

    const result = loadPipelineFromFile(filePath);
    expect(result.ok).toBe(true);
    expect(result.value!.pipeline).toHaveLength(2);
    expect(result.value!.pipeline[0]!.agent).toBe("build");
    expect(result.value!.pipeline[1]!.agent).toBe("test");
    expect(result.value!.pipeline[1]!.repeat).toBe(3);
    expect(result.value!.finalizer).toEqual(["cleanup"]);
    expect(result.value!.triggers).toEqual({ push: "main" });

    rmSync(dir, { recursive: true, force: true });
  });

  test("returns error when file does not exist", () => {
    const result = loadPipelineFromFile("/tmp/this/file/does/not/exist/12345.yml");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toStartWith("cannot read pipeline file:");
    expect(result.errors[0]).toContain("ENOENT");
  });

  test("returns error with the file path in the message", () => {
    const { mkdtempSync, rmSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");

    const dir = mkdtempSync(join(tmpdir(), "aloop-pipeline-file-"));
    const filePath = join(dir, "nonexistent.yml");

    const result = loadPipelineFromFile(filePath);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(filePath);

    rmSync(dir, { recursive: true, force: true });
  });
});
