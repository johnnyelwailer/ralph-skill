import { describe, expect, test } from "bun:test";
import { createOpencodeAdapter } from "./opencode.ts";

describe("createOpencodeAdapter", () => {
  // ─── resolveModel ────────────────────────────────────────────────────────────

  test("resolveModel uses default model for bare refs", () => {
    const adapter = createOpencodeAdapter({ defaultModelId: "opencode/default-v2" });
    const model = adapter.resolveModel("opencode");
    expect(model.providerId).toBe("opencode");
    expect(model.modelId).toBe("opencode/default-v2");
  });

  test("resolveModel uses hardcoded default when no defaultModelId option provided", () => {
    const adapter = createOpencodeAdapter();
    const model = adapter.resolveModel("opencode");
    expect(model.modelId).toBe("opencode/default");
  });

  test("resolveModel keeps track/model/version segments", () => {
    const adapter = createOpencodeAdapter();
    const model = adapter.resolveModel("opencode/openrouter/glm@5.1");
    expect(model.modelId).toBe("openrouter/glm@5.1");
    expect(model.track).toBe("openrouter");
    expect(model.version).toBe("5.1");
  });

  test("resolveModel preserves track without version", () => {
    const adapter = createOpencodeAdapter();
    const model = adapter.resolveModel("opencode/anthropic");
    expect(model.modelId).toBe("anthropic");
    expect(model.track).toBe("anthropic");
    expect(model.version).toBeUndefined();
  });

  test("resolveModel uses default model when path has no model segment (only provider)", () => {
    // "opencode/@5.0" parses to providerId=opencode, version=5.0, but no track or model
    // → modelPath is empty → falls back to default
    const adapter = createOpencodeAdapter();
    const model = adapter.resolveModel("opencode/@5.0");
    expect(model.modelId).toBe("opencode/default");
    expect(model.version).toBe("5.0");
  });

  test("resolveModel throws for non-opencode provider ref", () => {
    const adapter = createOpencodeAdapter();
    expect(() => adapter.resolveModel("anthropic/claude-3-5")).toThrow(
      "opencode adapter cannot resolve provider ref: anthropic/claude-3-5",
    );
  });

  // ─── sendTurn — success paths ───────────────────────────────────────────────

  test("sendTurn yields text + usage on success", async () => {
    const adapter = createOpencodeAdapter({
      runTurn: async () => ({
        ok: true,
        text: "hello",
        usage: { tokensIn: 10, tokensOut: 5, costUsd: 0.01 },
      }),
    });
    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ type: "text", content: { delta: "hello" } });
    expect(chunks[1]).toMatchObject({
      type: "usage",
      final: true,
      content: { providerId: "opencode", tokensIn: 10, tokensOut: 5 },
    });
  });

  test("sendTurn passes timeoutMs through when provided", async () => {
    let receivedTimeoutMs: number | undefined;
    const adapter = createOpencodeAdapter({
      runTurn: async ({ timeoutMs }) => {
        receivedTimeoutMs = timeoutMs;
        return { ok: true, text: "ok" };
      },
    });
    for await (const _ of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
      timeoutMs: 30_000,
    })) {
      // consume
    }
    expect(receivedTimeoutMs).toBe(30_000);
  });

  test("sendTurn omits timeoutMs from options when not provided", async () => {
    let receivedKeys: string[] = [];
    const adapter = createOpencodeAdapter({
      runTurn: async (opts) => {
        receivedKeys = Object.keys(opts);
        return { ok: true, text: "ok" };
      },
    });
    for await (const _ of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      // consume
    }
    expect(receivedKeys).not.toContain("timeoutMs");
  });

  test("sendTurn passes environment through when provided", async () => {
    const env = { OPENAI_API_KEY: "sk-test", MY_VAR: "custom" };
    let receivedEnv: Record<string, string> | undefined;
    const adapter = createOpencodeAdapter({
      runTurn: async ({ environment }) => {
        receivedEnv = environment;
        return { ok: true, text: "ok" };
      },
    });
    for await (const _ of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
      environment: env,
    })) {
      // consume
    }
    expect(receivedEnv).toEqual(env);
  });

  test("sendTurn usage includes cacheRead when present", async () => {
    const adapter = createOpencodeAdapter({
      runTurn: async () => ({
        ok: true,
        text: "result",
        usage: { tokensIn: 100, tokensOut: 50, cacheRead: 800, costUsd: 0.005 },
      }),
    });
    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }
    const usageChunk = chunks.find((c) => c.type === "usage");
    expect(usageChunk).toMatchObject({
      type: "usage",
      final: true,
      content: expect.objectContaining({ cacheRead: 800 }),
    });
  });

  test("sendTurn usage omits cacheRead when not provided", async () => {
    const adapter = createOpencodeAdapter({
      runTurn: async () => ({
        ok: true,
        text: "result",
        usage: { tokensIn: 10, tokensOut: 5 },
      }),
    });
    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }
    const usageChunk = chunks.find((c) => c.type === "usage");
    expect((usageChunk as { content: Record<string, unknown> }).content).not.toHaveProperty("cacheRead");
  });

  // ─── sendTurn — error / failure paths ──────────────────────────────────────

  test("sendTurn emits classified error chunk on failure", async () => {
    const adapter = createOpencodeAdapter({
      runTurn: async () => ({
        ok: false,
        exitCode: 1,
        stderr: "HTTP 429 rate limit",
      }),
    });
    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      type: "error",
      content: { classification: "rate_limit", retriable: true },
    });
  });

  test("sendTurn uses stdout as error message when stderr is empty", async () => {
    const adapter = createOpencodeAdapter({
      runTurn: async () => ({
        ok: false,
        exitCode: 1,
        stderr: "",
        stdout: "openai api key missing",
      }),
    });
    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as { content: { message: string } }).content.message).toBe(
      "openai api key missing",
    );
  });

  test("sendTurn uses generic message when both stdout and stderr are empty", async () => {
    const adapter = createOpencodeAdapter({
      runTurn: async () => ({
        ok: false,
        exitCode: 1,
        stderr: "",
        stdout: "",
      }),
    });
    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as { content: { message: string } }).content.message).toBe(
      "opencode invocation failed",
    );
  });

  test("sendTurn passes modelId from resolved model to runTurn", async () => {
    let receivedModelId: string | undefined;
    const adapter = createOpencodeAdapter({
      runTurn: async ({ modelId }) => {
        receivedModelId = modelId;
        return { ok: true, text: "ok" };
      },
    });
    for await (const _ of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode/openrouter/claude@3.5",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      // consume
    }
    expect(receivedModelId).toBe("openrouter/claude@3.5");
  });
});
