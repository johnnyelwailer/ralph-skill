import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runOpencodeCli, type OpencodeRunResult } from "./opencode-runner.ts";

type MockSpawnResponse = {
  exited: number;
  stdout?: string;
  stderr?: string;
};

let spawnResponses: MockSpawnResponse[] = [];
let resolveExited: ((v: number) => void) | null = null;
let procKillCalled = false;
let spawnedCalls: Array<{ args: string[]; opts: Record<string, unknown> }> = [];

const originalSpawn = Bun.spawn;

function makeMockProc(response: MockSpawnResponse): ReturnType<typeof Bun.spawn> {
  let resolve: ((v: number) => void) | null = null;
  const p = new Promise<number>((r) => {
    resolve = r;
    resolveExited = r;
  });
  if (response.exited >= 0) {
    queueMicrotask(() => resolve!(response.exited));
  }
  return {
    stdout: response.stdout
      ? new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(response.stdout!)); c.close(); } })
      : null,
    stderr: response.stderr
      ? new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(response.stderr!)); c.close(); } })
      : null,
    get exited() { return p; },
    kill() {
      procKillCalled = true;
      if (resolveExited) resolveExited(response.exited);
    },
  } as unknown as ReturnType<typeof Bun.spawn>;
}

function setSpawnResponses(...responses: MockSpawnResponse[]) {
  spawnResponses = responses;
}

async function runOk(input: {
  modelId?: string;
  prompt?: string;
  cwd?: string;
  variant?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  command?: string;
}): Promise<OpencodeRunResult> {
  return runOpencodeCli({
    modelId: input.modelId ?? "opencode/default",
    prompt: input.prompt ?? "hello",
    cwd: input.cwd ?? "/repo",
    ...(input.variant !== undefined && { variant: input.variant }),
    ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
    ...(input.env !== undefined && { environment: input.env }),
    ...(input.command !== undefined && { command: input.command }),
  });
}

describe("runOpencodeCli", () => {
  beforeEach(() => {
    spawnResponses = [];
    procKillCalled = false;
    spawnedCalls = [];
    resolveExited = null;
    // @ts-expect-error – replacing Bun.spawn for test isolation
    Bun.spawn = (args: string[], opts: Record<string, unknown>) => {
      spawnedCalls.push({ args, opts });
      const response = spawnResponses.shift() ?? { exited: 0, stdout: "" };
      return makeMockProc(response);
    };
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  test("spawns opencode run with --model, --dir, --format json, and positional prompt", async () => {
    setSpawnResponses({ exited: 0, stdout: "result text" });
    await runOk({ modelId: "opencode/model-x", prompt: "say hello", cwd: "/home/user" });
    const spawnedArgs = spawnedCalls[0]!.args;
    expect(spawnedArgs).toContain("--model");
    expect(spawnedArgs).toContain("opencode/model-x");
    expect(spawnedArgs).toContain("--dir");
    expect(spawnedArgs).toContain("/home/user");
    expect(spawnedArgs).toContain("--format");
    expect(spawnedArgs).toContain("json");
    expect(spawnedArgs).not.toContain("--cwd");
    expect(spawnedArgs).not.toContain("--prompt");
    expect(spawnedArgs.at(-1)).toBe("say hello");
  });

  test("uses 'opencode' as default command", async () => {
    setSpawnResponses({ exited: 0, stdout: "ok" });
    await runOk({});
    const spawnedArgs = spawnedCalls[0]!.args;
    expect(spawnedArgs[0]).toBe("opencode");
  });

  test("uses custom command when provided", async () => {
    setSpawnResponses({ exited: 0, stdout: "ok" });
    await runOk({ command: "/usr/local/bin/opencode-dev" });
    const spawnedArgs = spawnedCalls[0]!.args;
    expect(spawnedArgs[0]).toBe("/usr/local/bin/opencode-dev");
  });

  test("returns ok:true with text when exit code is 0", async () => {
    setSpawnResponses({ exited: 0, stdout: "hello from opencode" });
    const result = await runOk({});
    expect(result.ok).toBe(true);
    expect((result as { ok: true }).text).toBe("hello from opencode");
  });

  test("exports the opencode session to recover final text and usage", async () => {
    setSpawnResponses(
      {
        exited: 0,
        stdout: '{"type":"message.part.updated","sessionID":"ses_123","part":{"type":"text","text":"partial"}}\n',
      },
      {
        exited: 0,
        stdout: `Exporting session: ses_123\n${JSON.stringify({
          info: { id: "ses_123" },
          messages: [
            {
              info: { role: "assistant" },
              parts: [
                { type: "text", text: "hello" },
                { type: "text", text: " world" },
              ],
            },
            {
              info: {
                role: "assistant",
                cost: 0.25,
                tokens: { input: 11, output: 7, cache: { read: 5 } },
              },
              parts: [
                { type: "text", text: "final answer" },
              ],
            },
          ],
        })}`,
      },
    );

    const result = await runOk({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("final answer");
      expect(result.usage).toEqual({
        tokensIn: 11,
        tokensOut: 7,
        cacheRead: 5,
        costUsd: 0.25,
      });
    }

    expect(spawnedCalls).toHaveLength(2);
    expect(spawnedCalls[1]!.args).toEqual(["opencode", "export", "ses_123"]);
  });

  test("returns ok:false with exitCode, stdout, stderr when exit code is non-zero", async () => {
    setSpawnResponses({ exited: 1, stdout: "some output", stderr: "error message" });
    const result = await runOk({});
    expect(result.ok).toBe(false);
    expect((result as { ok: false }).exitCode).toBe(1);
    expect((result as { ok: false }).stdout).toBe("some output");
    expect((result as { ok: false }).stderr).toBe("error message");
  });

  test("calls proc.kill() and returns timedOut:true when timeout expires", async () => {
    setSpawnResponses({ exited: -1, stdout: "", stderr: "" });

    const result = await runOk({ timeoutMs: 1 });

    expect(procKillCalled).toBe(true);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; timedOut?: boolean }).timedOut).toBe(true);
  });

  test("includes stderr in result when exit code is 0 and stderr is non-empty", async () => {
    setSpawnResponses({ exited: 0, stdout: "result", stderr: "warning: deprecated option" });
    const result = await runOk({});
    expect(result.ok).toBe(true);
    expect((result as { ok: true; stderr?: string }).stderr).toBe("warning: deprecated option");
  });

  test("omits stderr field when exit code is 0 and stderr is empty", async () => {
    setSpawnResponses({ exited: 0, stdout: "clean result", stderr: "" });
    const result = await runOk({});
    expect(result.ok).toBe(true);
    const r = result as { ok: true; stderr?: string };
    expect("stderr" in r).toBe(false);
  });

  test("passes cwd to Bun.spawn options", async () => {
    setSpawnResponses({ exited: 0, stdout: "ok" });
    await runOk({ cwd: "/custom/workspace" });
    expect(spawnedCalls[0]!.opts["cwd"]).toBe("/custom/workspace");
  });

  test("passes env to Bun.spawn options (sanitized environment)", async () => {
    setSpawnResponses({ exited: 0, stdout: "ok" });
    await runOk({ env: { OPENAI_API_KEY: "sk-test" } });
    expect(spawnedCalls[0]!.opts["env"]).toBeDefined();
    const env = spawnedCalls[0]!.opts["env"] as Record<string, string>;
    expect(env["OPENAI_API_KEY"]).toBe("sk-test");
    expect(env["CLAUDECODE"]).toBeUndefined();
  });

  test("await proc.exited completes before returning result", async () => {
    setSpawnResponses({ exited: 0, stdout: "done" });
    const result = await runOk({});
    expect(result.ok).toBe(true);
  });

  test("result types are correct — ok:true has text, ok:false has exitCode", async () => {
    setSpawnResponses({ exited: 0, stdout: "success" });
    const okResult = await runOk({});
    expect(okResult.ok).toBe(true);
    if (okResult.ok) {
      expect(typeof okResult.text).toBe("string");
    }

    setSpawnResponses({ exited: 2, stdout: "", stderr: "failed" });
    const failResult = await runOk({});
    expect(failResult.ok).toBe(false);
    if (!failResult.ok) {
      expect(typeof failResult.exitCode).toBe("number");
    }
  });
});

describe("sanitizeProviderEnvironment", () => {
  let prevClaudecode: string | undefined;

  beforeEach(() => {
    prevClaudecode = process.env.CLAUDECODE;
    process.env.CLAUDECODE = "test-session-token";
    process.env.OPENAI_API_KEY = "sk-existing-key";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (prevClaudecode !== undefined) {
      process.env.CLAUDECODE = prevClaudecode;
    } else {
      delete process.env.CLAUDECODE;
    }
    delete process.env.OPENAI_API_KEY;
    delete process.env.NODE_ENV;
  });

  test("returns a plain object that is a copy of process.env", () => {
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment(undefined);
    expect(env).toBeDefined();
    expect(typeof env).toBe("object");
    expect(env).not.toBe(process.env);
  });

  test("always removes CLAUDECODE even when it is not set", () => {
    delete process.env.CLAUDECODE;
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment(undefined);
    expect(env.CLAUDECODE).toBeUndefined();
  });

  test("removes CLAUDECODE when it is present in process.env", () => {
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment(undefined);
    expect(env.CLAUDECODE).toBeUndefined();
  });

  test("preserves all other environment variables", () => {
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment(undefined);
    expect(env.OPENAI_API_KEY).toBe("sk-existing-key");
    expect(env.NODE_ENV).toBe("test");
  });

  test("merges extra env vars, overriding process.env values", () => {
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment({ OPENAI_API_KEY: "sk-overridden" });
    expect(env.OPENAI_API_KEY).toBe("sk-overridden");
  });

  test("extra vars not present in process.env are added", () => {
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment({ OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-ant" });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant");
  });

  test("undefined extra returns only the sanitized process.env snapshot", () => {
    const { sanitizeProviderEnvironment } = require("./opencode-runner.ts");
    const env = sanitizeProviderEnvironment(undefined);
    expect(env.OPENAI_API_KEY).toBe("sk-existing-key");
  });
});