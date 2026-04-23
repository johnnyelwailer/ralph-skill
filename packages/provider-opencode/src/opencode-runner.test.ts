import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runOpencodeCli, type OpencodeRunResult } from "./opencode-runner.ts";

// Mock Bun.spawn to test runOpencodeCli without a real opencode binary.
// The real Bun.spawn sets proc.exited to a Promise<number> that resolves when the
// process exits (or is killed). We replicate this so the timeout path works.
let mockExitedValue = 0;
let resolveExited: ((v: number) => void) | null = null;
let mockStdout = "";
let mockStderr = "";
let procKillCalled = false;
let spawnedArgs: string[] = [];
let spawnedOpts: Record<string, unknown> = {};
let exitPromiseResolve: ((v: number) => void) | null = null;

const originalSpawn = Bun.spawn;

function makeMockProc(): ReturnType<typeof Bun.spawn> {
  // Always return a Promise for proc.exited. For sync exit (mockExitedValue >= 0),
  // resolve immediately on the next tick so await proc.exited still yields.
  // For async/kill scenarios, resolve when resolveExited is called.
  let resolve: (v: number) => void;
  const p = new Promise<number>((r) => {
    resolve = r;
    resolveExited = r;
  });
  // For non-timeout cases: immediately resolve to the desired exit code
  if (mockExitedValue >= 0) {
    queueMicrotask(() => resolve!(mockExitedValue));
  }
  return {
    stdout: mockStdout
      ? new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(mockStdout)); c.close(); } })
      : null,
    stderr: mockStderr
      ? new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(mockStderr)); c.close(); } })
      : null,
    get exited() { return p; },
    kill() {
      procKillCalled = true;
      if (resolveExited) resolveExited(mockExitedValue);
    },
  } as unknown as ReturnType<typeof Bun.spawn>;
}

async function runOk(input: {
  modelId?: string;
  prompt?: string;
  cwd?: string;
  timeoutMs?: number;
  command?: string;
  env?: Record<string, string>;
}): Promise<OpencodeRunResult> {
  return runOpencodeCli({
    modelId: input.modelId ?? "opencode/default",
    prompt: input.prompt ?? "test prompt",
    cwd: input.cwd ?? "/tmp",
    timeoutMs: input.timeoutMs,
    command: input.command,
    environment: input.env,
  });
}

describe("runOpencodeCli", () => {
  beforeEach(() => {
    mockExitedValue = 0;
    mockStdout = "";
    mockStderr = "";
    procKillCalled = false;
    spawnedArgs = [];
    spawnedOpts = {};
    resolveExited = null;
    // @ts-expect-error – replacing Bun.spawn for test isolation
    Bun.spawn = (args: string[], opts: Record<string, unknown>) => {
      spawnedArgs = args;
      spawnedOpts = opts;
      return makeMockProc();
    };
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("spawns opencode run with --model, --cwd, --prompt flags", async () => {
    mockStdout = "result text";
    await runOk({ modelId: "opencode/model-x", prompt: "say hello", cwd: "/home/user" });
    expect(spawnedArgs).toContain("--model");
    expect(spawnedArgs).toContain("opencode/model-x");
    expect(spawnedArgs).toContain("--cwd");
    expect(spawnedArgs).toContain("/home/user");
    expect(spawnedArgs).toContain("--prompt");
    expect(spawnedArgs).toContain("say hello");
  });

  test("uses 'opencode' as default command", async () => {
    mockStdout = "ok";
    await runOk({});
    expect(spawnedArgs[0]).toBe("opencode");
  });

  test("uses custom command when provided", async () => {
    mockStdout = "ok";
    await runOk({ command: "/usr/local/bin/opencode-dev" });
    expect(spawnedArgs[0]).toBe("/usr/local/bin/opencode-dev");
  });

  test("returns ok:true with text when exit code is 0", async () => {
    mockExitedValue = 0;
    mockStdout = "hello from opencode";
    const result = await runOk({});
    expect(result.ok).toBe(true);
    expect((result as { ok: true }).text).toBe("hello from opencode");
  });

  test("returns ok:false with exitCode, stdout, stderr when exit code is non-zero", async () => {
    mockExitedValue = 1;
    mockStdout = "some output";
    mockStderr = "error message";
    const result = await runOk({});
    expect(result.ok).toBe(false);
    expect((result as { ok: false }).exitCode).toBe(1);
    expect((result as { ok: false }).stdout).toBe("some output");
    expect((result as { ok: false }).stderr).toBe("error message");
    expect((result as { ok: false }).timedOut).toBeUndefined();
  });

  test("calls proc.kill() and returns timedOut:true when timeout expires", async () => {
    // Make proc.exited never resolve until kill() is called (simulates a hanging process)
    mockExitedValue = -1; // negative means "async — will be resolved by kill()"
    mockStdout = "";
    mockStderr = "";

    const result = await runOk({ timeoutMs: 1 });

    expect(procKillCalled).toBe(true);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; timedOut: boolean }).timedOut).toBe(true);
  });

  test("includes stderr in result when exit code is 0 and stderr is non-empty", async () => {
    mockExitedValue = 0;
    mockStdout = "result";
    mockStderr = "warning: deprecated option";
    const result = await runOk({});
    expect(result.ok).toBe(true);
    expect((result as { ok: true; stderr?: string }).stderr).toBe("warning: deprecated option");
  });

  test("omits stderr field when exit code is 0 and stderr is empty", async () => {
    mockExitedValue = 0;
    mockStdout = "clean result";
    mockStderr = "";
    const result = await runOk({});
    expect(result.ok).toBe(true);
    const r = result as { ok: true; stderr?: string };
    expect(r.stderr).toBeUndefined();
  });

  test("passes cwd to Bun.spawn options", async () => {
    mockStdout = "ok";
    await runOk({ cwd: "/custom/workspace" });
    expect(spawnedOpts["cwd"]).toBe("/custom/workspace");
  });

  test("passes env to Bun.spawn options (sanitized environment)", async () => {
    mockStdout = "ok";
    await runOk({ env: { OPENAI_API_KEY: "sk-test" } });
    expect(spawnedOpts["env"]).toBeDefined();
    const env = spawnedOpts["env"] as Record<string, string>;
    expect(env["OPENAI_API_KEY"]).toBe("sk-test");
    // CLAUDECODE should have been removed
    expect(env["CLAUDECODE"]).toBeUndefined();
  });

  test("await proc.exited completes before returning result", async () => {
    mockExitedValue = 0;
    mockStdout = "done";
    const result = await runOk({});
    expect(result.ok).toBe(true);
  });

  test("result types are correct — ok:true has text, ok:false has exitCode", async () => {
    mockExitedValue = 0;
    mockStdout = "success";
    const okResult = await runOk({});
    expect(okResult.ok).toBe(true);
    if (okResult.ok) {
      expect(typeof okResult.text).toBe("string");
    }

    mockExitedValue = 2;
    mockStdout = "";
    mockStderr = "failed";
    const failResult = await runOk({});
    expect(failResult.ok).toBe(false);
    if (!failResult.ok) {
      expect(typeof failResult.exitCode).toBe("number");
    }
  });
});
