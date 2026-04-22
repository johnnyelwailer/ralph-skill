import { describe, expect, test } from "bun:test";
import { createOpencodeAdapter } from "./opencode.ts";

describe("createOpencodeAdapter", () => {
  test("resolveModel uses default model for bare refs", () => {
    const adapter = createOpencodeAdapter({ defaultModelId: "opencode/default-v2" });
    const model = adapter.resolveModel("opencode");
    expect(model.providerId).toBe("opencode");
    expect(model.modelId).toBe("opencode/default-v2");
  });

  test("resolveModel keeps track/model/version segments", () => {
    const adapter = createOpencodeAdapter();
    const model = adapter.resolveModel("opencode/openrouter/glm@5.1");
    expect(model.modelId).toBe("openrouter/glm@5.1");
    expect(model.track).toBe("openrouter");
    expect(model.version).toBe("5.1");
  });

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
});
