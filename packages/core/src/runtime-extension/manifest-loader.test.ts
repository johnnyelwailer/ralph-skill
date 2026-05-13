import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadManifests, loadExecManifests, loadContextProviderManifests, parseTimeoutMs } from "./manifest-loader.ts";

function makeTmpDir(): string {
  const dir = `/tmp/aloop-ml-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTmpDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe("parseTimeoutMs", () => {
  test("parses seconds", () => {
    expect(parseTimeoutMs("30s")).toBe(30_000);
  });
  test("parses minutes", () => {
    expect(parseTimeoutMs("5m")).toBe(300_000);
  });
  test("parses hours", () => {
    expect(parseTimeoutMs("1h")).toBe(3_600_000);
  });
  test("throws on invalid format", () => {
    expect(() => parseTimeoutMs("invalid")).toThrow();
    expect(() => parseTimeoutMs("10x")).toThrow();
  });
});

describe("loadExecManifests", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanupTmpDir(tmpDir); });

  test("loads valid exec manifest", () => {
    writeFileSync(join(tmpDir, "EXEC_regen-api.yml"), `
kind: exec
runtime: bun
file: scripts/regen-api.ts
args: ["--check"]
cwd: worktree
timeout: 5m
platforms: [darwin, linux]
env_allowlist: [OPENAPI_BASE_URL]
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(0);
    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0]).toEqual({
      kind: "exec",
      runtime: "bun",
      file: "scripts/regen-api.ts",
      args: ["--check"],
      cwd: "worktree",
      timeout: "5m",
      platforms: ["darwin", "linux"],
      envAllowlist: ["OPENAPI_BASE_URL"],
      idempotent: true,
    });
  });

  test("loads minimal exec manifest", () => {
    writeFileSync(join(tmpDir, "EXEC_minimal.yml"), `
kind: exec
runtime: node
file: script.js
timeout: 10s
cwd: repo
idempotent: false
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(0);
    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0].platforms).toBeUndefined();
    expect(result.manifests[0].args).toBeUndefined();
    expect(result.manifests[0].envAllowlist).toBeUndefined();
  });

  test("rejects wrong kind in exec file", () => {
    writeFileSync(join(tmpDir, "EXEC_wrong.yml"), `
kind: context-provider
id: test
runtime: bun
file: script.ts
timeout: 10s
cwd: repo
capabilities:
  read_events: false
  read_tracker: false
  read_metrics: false
  network: false
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("kind=context-provider");
  });

  test("rejects missing required fields", () => {
    writeFileSync(join(tmpDir, "EXEC_missing-fields.yml"), `
kind: exec
runtime: bun
file: script.ts
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("missing required field");
  });

  test("rejects invalid runtime", () => {
    writeFileSync(join(tmpDir, "EXEC_bad-runtime.yml"), `
kind: exec
runtime: python
file: script.py
timeout: 10s
cwd: repo
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Invalid runtime");
  });

  test("rejects invalid platform", () => {
    writeFileSync(join(tmpDir, "EXEC_bad-platform.yml"), `
kind: exec
runtime: bun
file: script.ts
timeout: 10s
cwd: repo
platforms: [freebsd]
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Invalid platform");
  });

  test("rejects invalid timeout format", () => {
    writeFileSync(join(tmpDir, "EXEC_bad-timeout.yml"), `
kind: exec
runtime: bun
file: script.ts
timeout: bad
cwd: repo
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Invalid timeout format");
  });

  test("rejects absolute path cwd", () => {
    writeFileSync(join(tmpDir, "EXEC_bad-cwd.yml"), `
kind: exec
runtime: bun
file: script.ts
timeout: 10s
cwd: /absolute/path
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("must not be an absolute path");
  });

  test("skips non-yml files", () => {
    writeFileSync(join(tmpDir, "README.md"), "some readme");
    writeFileSync(join(tmpDir, "EXEC_valid.yml"), `
kind: exec
runtime: bun
file: script.ts
timeout: 10s
cwd: repo
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(0);
    expect(result.manifests).toHaveLength(1);
  });

  test("returns error for non-existent directory", () => {
    const result = loadExecManifests({ templatesDir: "/non/existent/dir" });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("does not exist");
  });

  test("loads single exec manifest", () => {
    writeFileSync(join(tmpDir, "EXEC_first.yml"), `
kind: exec
runtime: bun
file: first.ts
timeout: 10s
cwd: repo
idempotent: true
`.trim());

    const result = loadExecManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(0);
    expect(result.manifests).toHaveLength(1);
  });
});

describe("loadContextProviderManifests", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanupTmpDir(tmpDir); });

  test("loads valid context-provider manifest", () => {
    writeFileSync(join(tmpDir, "CONTEXT_orch-recall.yml"), `
kind: context-provider
id: orch_recall
runtime: bun
file: scripts/context/orch-recall.ts
timeout: 10s
cwd: repo
platforms: [darwin, linux]
env_allowlist: [MEMPALACE_URL]
capabilities:
  read_events: true
  read_tracker: true
  read_metrics: true
  network: true
`.trim());

    const result = loadContextProviderManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(0);
    expect(result.manifests).toHaveLength(1);
    expect(result.manifests[0]).toEqual({
      kind: "context-provider",
      id: "orch_recall",
      runtime: "bun",
      file: "scripts/context/orch-recall.ts",
      timeout: "10s",
      cwd: "repo",
      platforms: ["darwin", "linux"],
      envAllowlist: ["MEMPALACE_URL"],
      capabilities: {
        readEvents: true,
        readTracker: true,
        readMetrics: true,
        network: true,
      },
    });
  });

  test("rejects context-provider with exec kind", () => {
    writeFileSync(join(tmpDir, "CONTEXT_wrong.yml"), `
kind: exec
id: test
runtime: bun
file: script.ts
timeout: 10s
cwd: repo
idempotent: true
`.trim());

    const result = loadContextProviderManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("context-provider");
  });

  test("rejects missing capabilities", () => {
    writeFileSync(join(tmpDir, "CONTEXT_no-caps.yml"), `
kind: context-provider
id: test
runtime: bun
file: script.ts
timeout: 10s
cwd: repo
`.trim());

    const result = loadContextProviderManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("capabilities");
  });
});

describe("loadManifests", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanupTmpDir(tmpDir); });

  test("loads both exec and context-provider manifests", () => {
    writeFileSync(join(tmpDir, "EXEC_test.yml"), `
kind: exec
runtime: bun
file: exec.ts
timeout: 10s
cwd: repo
idempotent: true
`.trim());
    writeFileSync(join(tmpDir, "CONTEXT_test.yml"), `
kind: context-provider
id: test_ctx
runtime: bun
file: ctx.ts
timeout: 10s
cwd: repo
capabilities:
  read_events: true
  read_tracker: false
  read_metrics: false
  network: false
`.trim());

    const result = loadManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(0);
    expect(result.manifests).toHaveLength(2);
    expect(result.manifests.find((m) => m.kind === "exec")).toBeDefined();
    expect(result.manifests.find((m) => m.kind === "context-provider")).toBeDefined();
  });

  test("skips files without exec or context-provider prefix", () => {
    writeFileSync(join(tmpDir, "NOTE.yml"), `some: note`);
    writeFileSync(join(tmpDir, "EXEC_valid.yml"), `
kind: exec
runtime: bun
file: script.ts
timeout: 10s
cwd: repo
idempotent: true
`.trim());

    const result = loadManifests({ templatesDir: tmpDir });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe("NOTE.yml");
    expect(result.errors[0].error).toContain("Unknown manifest kind");
  });
});