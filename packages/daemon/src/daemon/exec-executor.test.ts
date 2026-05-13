import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { executeExec, type ExecContext } from "./exec-executor.ts";
import type { ExecManifest } from "@aloop/core";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

function makeTmpDir(): string {
  const dir = `/tmp/aloop-exec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTmpDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function makeManifest(overrides: Partial<ExecManifest> = {}): ExecManifest {
  return {
    kind: "exec",
    runtime: "bun",
    file: "script.ts",
    args: ["--version"],
    cwd: "repo",
    timeout: "10s",
    idempotent: false,
    ...overrides,
  };
}

function makeContext(dir: string): ExecContext {
  return { projectRoot: dir };
}

describe("executeExec", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanupTmpDir(tmpDir); });

  test("runs a simple bun script and returns output", async () => {
    writeFileSync(join(tmpDir, "script.ts"), `console.log("hello world");`);

    const manifest = makeManifest({ runtime: "bun", args: ["--version"] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1.");
    expect(result.stderr).toBe("");
  });

test("returns non-zero exit code on script failure", async () => {
    writeFileSync(join(tmpDir, "script.ts"), `console.error("error output"); process.exit(1);`);

    const manifest = makeManifest({ runtime: "bun", args: [] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  test("times out when script exceeds timeout", async () => {
    writeFileSync(join(tmpDir, "script.ts"), `await new Promise(r => setTimeout(r, 5000)); console.log("done");`);

    const manifest = makeManifest({ timeout: "100ms", args: [] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  test("respects env_allowlist when set", async () => {
    writeFileSync(join(tmpDir, "script.ts"), `console.log("hello");`);

    const manifest = makeManifest({ envAllowlist: ["PATH"], args: [] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("hello");
  });

  test("respects cwd=repo", async () => {
    writeFileSync(join(tmpDir, "script.ts"), `console.log(process.cwd());`);
    mkdirSync(join(tmpDir, "subdir"), { recursive: true });
    writeFileSync(join(tmpDir, "subdir", "marker"), "");

    const manifest = makeManifest({ cwd: "repo", args: [] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.stdout.trim()).toBe(tmpDir);
  });

  test("respects cwd=worktree when worktree is set", async () => {
    mkdirSync(join(tmpDir, "worktree"), { recursive: true });
    writeFileSync(join(tmpDir, "worktree", "script.ts"), `console.log(process.cwd());`);

    const manifest = makeManifest({ cwd: "worktree", file: "script.ts", args: [] });
    const context = { projectRoot: tmpDir, worktreeRoot: join(tmpDir, "worktree") };

    const result = await executeExec({ manifest, context });

    expect(result.stdout.trim()).toBe(join(tmpDir, "worktree"));
  });

  test("throws when cwd=worktree but no worktreeRoot configured", async () => {
    const manifest = makeManifest({ cwd: "worktree" });
    const context = makeContext(tmpDir);

    await expect(executeExec({ manifest, context })).rejects.toThrow("no worktree is configured");
  });

  test("runs bash scripts", async () => {
    writeFileSync(join(tmpDir, "script.sh"), `echo "from bash"`);

    const manifest = makeManifest({ runtime: "bash", file: "script.sh", args: [] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("from bash");
  });

  test("passes args to the runtime", async () => {
    writeFileSync(join(tmpDir, "script.ts"), `console.log("file:", process.argv[2]);`);

    const manifest = makeManifest({ args: [] });
    const context = makeContext(tmpDir);

    const result = await executeExec({ manifest, context });

    expect(result.stdout).toContain("file:");
  });
});