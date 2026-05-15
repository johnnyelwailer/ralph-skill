import { describe, expect, test } from "bun:test";
import { createLocalHostSandbox, type LocalHostSandboxOptions } from "./local-host.ts";
import type { AgentChunk, ProviderAdapter } from "./types.ts";

const mockProvider: ProviderAdapter = {
  id: "mock",
  capabilities: {
    streaming: true,
    vision: false,
    toolUse: true,
    reasoningEffort: false,
    quotaProbe: false,
    sessionResume: false,
    costReporting: false,
    maxContextTokens: null,
  },
  resolveModel: () => ({ providerId: "mock", modelId: "mock-model" }),
  async *sendTurn(input) {
    yield { type: "text", content: { delta: `hello ${input.prompt}` } };
    yield {
      type: "usage",
      final: true,
      content: { tokensIn: 10, tokensOut: 20 },
    };
  },
};

describe("createLocalHostSandbox", () => {
  test("creates sandbox adapter with correct id and target", () => {
    const sandbox = createLocalHostSandbox({ provider: mockProvider });
    expect(sandbox.id).toBe("local-host");
    expect(sandbox.sandboxTarget).toBe("host");
  });

  test("acquireSession stores environment for session", async () => {
    const sandbox = createLocalHostSandbox({ provider: mockProvider });
    const environment = {
      sandboxTarget: "host" as const,
      worktreeRoot: "/tmp/worktree",
      projectRoot: "/tmp/project",
      authHandle: "auth_123",
    };
    await sandbox.acquireSession({ sessionId: "s1", environment });
    const chunks: AgentChunk[] = [];
    for await (const chunk of sandbox.runTurn({
      sessionId: "s1",
      authHandle: "auth_123",
      environment,
      input: {
        sessionId: "s1",
        authHandle: "auth_123",
        providerRef: "mock",
        prompt: "test prompt",
        cwd: "/tmp/project",
      },
    })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("releaseSession removes session environment", async () => {
    const sandbox = createLocalHostSandbox({ provider: mockProvider });
    const environment = {
      sandboxTarget: "host" as const,
      worktreeRoot: "/tmp/worktree",
      projectRoot: "/tmp/project",
      authHandle: "auth_123",
    };
    await sandbox.acquireSession({ sessionId: "s1", environment });
    await sandbox.releaseSession("s1");
    await expect(async () => {
      for await (const _ of sandbox.runTurn({
        sessionId: "s1",
        authHandle: "auth_123",
        environment,
        input: {
          sessionId: "s1",
          authHandle: "auth_123",
          providerRef: "mock",
          prompt: "test prompt",
          cwd: "/tmp/project",
        },
      })) {
        // empty
      }
    }).toThrow();
  });

  test("runTurn delegates to provider with overridden cwd", async () => {
    const provider = {
      ...mockProvider,
      async *sendTurn(input) {
        yield { type: "text", content: { delta: `cwd=${input.cwd}` } };
      },
    };
    const sandbox = createLocalHostSandbox({ provider });
    const environment = {
      sandboxTarget: "host" as const,
      worktreeRoot: "/tmp/worktree",
      projectRoot: "/override/root",
      authHandle: "auth_123",
    };
    await sandbox.acquireSession({ sessionId: "s1", environment });
    const chunks: AgentChunk[] = [];
    for await (const chunk of sandbox.runTurn({
      sessionId: "s1",
      authHandle: "auth_123",
      environment,
      input: {
        sessionId: "s1",
        authHandle: "auth_123",
        providerRef: "mock",
        prompt: "test",
        cwd: "/original/cwd",
      },
    })) {
      chunks.push(chunk);
    }
    const textChunk = chunks.find((c) => c.type === "text");
    expect(textChunk?.type).toBe("text");
    expect((textChunk as { type: "text" }).content.delta).toBe("cwd=/override/root");
  });

  test("dispose clears all sessions", async () => {
    const sandbox = createLocalHostSandbox({ provider: mockProvider });
    const environment = {
      sandboxTarget: "host" as const,
      worktreeRoot: "/tmp/worktree",
      projectRoot: "/tmp/project",
      authHandle: "auth_123",
    };
    await sandbox.acquireSession({ sessionId: "s1", environment });
    await sandbox.acquireSession({ sessionId: "s2", environment });
    await sandbox.dispose();
    await expect(async () => {
      for await (const _ of sandbox.runTurn({
        sessionId: "s1",
        authHandle: "auth_123",
        environment,
        input: {
          sessionId: "s1",
          authHandle: "auth_123",
          providerRef: "mock",
          prompt: "test",
          cwd: "/tmp/project",
        },
      })) {
        // empty
      }
    }).toThrow();
  });
});