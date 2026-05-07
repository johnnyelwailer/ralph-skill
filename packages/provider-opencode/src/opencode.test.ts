import { afterEach, describe, expect, test } from "bun:test";
import { __testHooks, createOpencodeAdapter } from "./opencode.ts";

const ENV_KEYS_UNDER_TEST = ["OPENAI_API_KEY", "AUTH_HANDLE", "ALOOP_SESSION_ID", "CLAUDECODE"] as const;

afterEach(() => {
  for (const key of ENV_KEYS_UNDER_TEST) delete process.env[key];
});

afterEach(async () => {
  await __testHooks.resetCachedServers();
});

describe("createOpencodeAdapter", () => {
  test("advertises rich opencode capabilities", () => {
    expect(createOpencodeAdapter().capabilities).toMatchObject({
      streaming: true,
      vision: true,
      toolUse: true,
      reasoningEffort: true,
      sessionResume: true,
      costReporting: true,
    });
  });

  test("resolveModel uses default model for bare refs", () => {
    const model = createOpencodeAdapter({ defaultModelId: "opencode/default-v2" }).resolveModel("opencode");
    expect(model.providerId).toBe("opencode");
    expect(model.modelId).toBe("opencode/default-v2");
  });

  test("resolveModel keeps track/model/version segments", () => {
    const model = createOpencodeAdapter().resolveModel("opencode/openrouter/glm@5.1");
    expect(model.modelId).toBe("openrouter/glm@5.1");
    expect(model.track).toBe("openrouter");
    expect(model.version).toBe("5.1");
  });

  test("sendTurn still supports test-only runTurn overrides", async () => {
    let receivedTimeoutMs: number | undefined;
    let receivedEnvironment: Record<string, string> | undefined;
    let receivedModelId: string | undefined;
    const adapter = createOpencodeAdapter({
      runTurn: async ({ timeoutMs, environment, modelId }) => {
        receivedTimeoutMs = timeoutMs;
        receivedEnvironment = environment;
        receivedModelId = modelId;
        return { ok: true, text: "hello", usage: { tokensIn: 10, tokensOut: 5, cacheRead: 3, costUsd: 0.01 } };
      },
    });

    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "session-123",
      authHandle: "auth-handle-xyz",
      providerRef: "opencode/openrouter/claude@3.5",
      prompt: "ping",
      cwd: "/tmp/project",
      timeoutMs: 30_000,
      environment: { OPENAI_API_KEY: "sk-test" },
    })) chunks.push(chunk);

    expect(receivedTimeoutMs).toBe(30_000);
    expect(receivedModelId).toBe("openrouter/claude@3.5");
    expect(receivedEnvironment).toMatchObject({
      OPENAI_API_KEY: "sk-test",
      AUTH_HANDLE: "auth-handle-xyz",
      ALOOP_SESSION_ID: "session-123",
      ALOOP_PROJECT_PATH: "/tmp/project",
      ALOOP_WORKTREE: "/tmp/project",
    });
    expect(chunks).toEqual([
      { type: "text", content: { delta: "hello" } },
      { type: "usage", final: true, content: { providerId: "opencode", modelId: "openrouter/claude@3.5", tokensIn: 10, tokensOut: 5, cacheRead: 3, costUsd: 0.01 } },
    ]);
  });

  test("sendTurn uses the client factory and passes reasoning effort plus prompt parts", async () => {
    const promptCalls: Array<Record<string, unknown>> = [];
    const adapter = createOpencodeAdapter({
      clientFactory: async () => ({
        getSessionId: async () => "oc_session",
        prompt: async (options) => {
          promptCalls.push(options as Record<string, unknown>);
          return { payload: { info: makePromptInfo(), parts: [makeReasoningPart("plan"), makeToolPart(), makeTextPart("done")] } };
        },
      }),
    });

    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode/openrouter/claude@3.5",
      prompt: "ping",
      promptParts: [
        { type: "text", text: "describe this image" },
        { type: "file", mime: "image/png", url: "https://example.com/image.png", filename: "image.png" },
      ],
      cwd: "/tmp",
      reasoningEffort: "high",
    })) chunks.push(chunk);

    expect(promptCalls[0]).toMatchObject({
      cwd: "/tmp",
      prompt: "ping",
      promptParts: [
        { type: "text", text: "describe this image" },
        { type: "file", mime: "image/png", url: "https://example.com/image.png", filename: "image.png" },
      ],
      reasoningEffort: "high",
      resolvedModel: { providerId: "opencode", modelId: "openrouter/claude@3.5", track: "openrouter", version: "3.5" },
    });
    expect(chunks).toEqual([
      { type: "thinking", content: { delta: "plan" } },
      { type: "tool_call", content: { name: "read_file", arguments: '{"path":"src/index.ts"}' } },
      { type: "tool_result", content: { id: "call_1", output: "contents" } },
      { type: "text", content: { delta: "done" } },
      { type: "usage", final: true, content: { providerId: "opencode", modelId: "openrouter/claude@3.5", tokensIn: 10, tokensOut: 5, cacheRead: 3, costUsd: 0.01 } },
    ]);
  });

  test("sendTurn emits classified error chunks from SDK failures", async () => {
    const adapter = createOpencodeAdapter({
      clientFactory: async () => ({
        getSessionId: async () => "oc_session",
        prompt: async () => ({ error: { data: { message: "HTTP 429 rate limit" } } }),
      }),
    });

    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: "error", content: { classification: "rate_limit", message: "HTTP 429 rate limit", retriable: true } },
    ]);
  });

  test("restores provider startup environment after SDK server bootstrap", async () => {
    process.env.OPENAI_API_KEY = "sk-original";
    process.env.CLAUDECODE = "legacy-token";
    await __testHooks.withTemporaryEnvironment(
      { OPENAI_API_KEY: "sk-session", AUTH_HANDLE: "auth-session", ALOOP_SESSION_ID: "session-123" },
      ["CLAUDECODE"],
      async () => {
        expect(process.env.OPENAI_API_KEY).toBe("sk-session");
        expect(process.env.AUTH_HANDLE).toBe("auth-session");
        expect(process.env.ALOOP_SESSION_ID).toBe("session-123");
        expect(process.env.CLAUDECODE).toBeUndefined();
      },
    );
    expect(process.env.OPENAI_API_KEY).toBe("sk-original");
    expect(process.env.AUTH_HANDLE).toBeUndefined();
    expect(process.env.ALOOP_SESSION_ID).toBeUndefined();
    expect(process.env.CLAUDECODE).toBe("legacy-token");
  });

  test("dispose closes cached SDK server contexts", async () => {
    const closed: string[] = [];
    __testHooks.addCachedServerForTest("server-a", () => { closed.push("a"); });
    __testHooks.addCachedServerForTest("server-b", () => { closed.push("b"); });
    const adapter = createOpencodeAdapter();
    expect(__testHooks.cachedServerCount()).toBe(2);
    await adapter.dispose?.();
    expect(closed.sort()).toEqual(["a", "b"]);
    expect(__testHooks.cachedServerCount()).toBe(0);
  });
});

function makePromptInfo() {
  return { cost: 0.01, tokens: { input: 10, output: 5, cache: { read: 3 } } } as const;
}

function makeReasoningPart(text: string) {
  return { id: "part_reasoning", type: "reasoning", text } as const;
}

function makeTextPart(text: string) {
  return { id: "part_text", type: "text", text } as const;
}

function makeToolPart() {
  return { id: "part_tool", type: "tool", callID: "call_1", tool: "read_file", state: { status: "completed", input: { path: "src/index.ts" }, output: "contents" } } as const;
}