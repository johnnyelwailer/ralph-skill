import { describe, expect, test } from "bun:test";
import { createOpencodeCliAdapter } from "./opencode-cli.ts";

describe("createOpencodeCliAdapter", () => {
  test("resolveModel uses default model for bare refs", () => {
    const adapter = createOpencodeCliAdapter({ defaultModelId: "opencode/default-v2" });
    const model = adapter.resolveModel("opencode-cli");
    expect(model.providerId).toBe("opencode-cli");
    expect(model.modelId).toBe("opencode/default-v2");
  });

  test("sendTurn yields text and usage with the renamed provider id", async () => {
    const adapter = createOpencodeCliAdapter({
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
      providerRef: "opencode-cli",
      prompt: "ping",
      cwd: "/tmp",
      reasoningEffort: "high",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ type: "text", content: { delta: "hello" } });
    expect(chunks[1]).toMatchObject({
      type: "usage",
      final: true,
      content: { providerId: "opencode-cli", tokensIn: 10, tokensOut: 5 },
    });
  });

  test("sendTurn classifies CLI failures under opencode-cli", async () => {
    const adapter = createOpencodeCliAdapter({
      runTurn: async () => ({ ok: false, exitCode: 1, stderr: "HTTP 429 rate limit" }),
    });

    const chunks = [];
    for await (const chunk of adapter.sendTurn({
      sessionId: "s1",
      authHandle: "auth",
      providerRef: "opencode-cli",
      prompt: "ping",
      cwd: "/tmp",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: "error",
        content: {
          classification: "rate_limit",
          message: "HTTP 429 rate limit",
          retriable: true,
        },
      },
    ]);
  });
});