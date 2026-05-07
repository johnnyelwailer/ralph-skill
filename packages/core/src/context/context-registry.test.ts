import { describe, expect, test } from "bun:test";
import { createContextRegistry, type ContextPlugin, type ContextInput, type ContextBlock } from "./context-registry.ts";

const FakeBlock = (id: string, title: string, body = "test body"): ContextBlock => ({
  id,
  title,
  body,
  sources: [],
});

const fakeInput: ContextInput = {
  sessionId: "s1",
  projectId: "p1",
  authHandle: "auth_s1",
  agentRole: "plan",
  contextId: "test_recall",
  budgetTokens: 8000,
};

describe("ContextRegistry", () => {
  test("register stores plugin by id", async () => {
    const registry = createContextRegistry();
    const plugin: ContextPlugin = {
      id: "recall",
      build: async () => [FakeBlock("b1", "Recall Block", "remembered")],
    };
    registry.register(plugin);
    const blocks = await registry.build(fakeInput, ["recall"]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.id).toBe("b1");
  });

  test("register replaces existing plugin with same id", async () => {
    const registry = createContextRegistry();
    registry.register({ id: "recall", build: async () => [FakeBlock("v1", "First", "first")] });
    registry.register({ id: "recall", build: async () => [FakeBlock("v2", "Second", "second")] });
    const blocks = await registry.build(fakeInput, ["recall"]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.title).toBe("Second");
  });

  test("build returns blocks from multiple plugins in declaration order", async () => {
    const registry = createContextRegistry();
    registry.register({ id: "a", build: async () => [FakeBlock("a1", "A Block")] });
    registry.register({ id: "b", build: async () => [FakeBlock("b1", "B Block")] });
    const blocks = await registry.build(fakeInput, ["a", "b"]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.id).toBe("a1");
    expect(blocks[1]!.id).toBe("b1");
  });

  test("build skips unknown context ids silently", async () => {
    const registry = createContextRegistry();
    registry.register({ id: "known", build: async () => [FakeBlock("k1", "Known")] });
    const blocks = await registry.build(fakeInput, ["known", "unknown", "also_unknown"]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.id).toBe("k1");
  });

  test("build propagates input to each plugin", async () => {
    const registry = createContextRegistry();
    registry.register({
      id: "inspect",
      build: async (input) => [
        FakeBlock("inspected", "Inspected", `session=${input.sessionId} project=${input.projectId}`),
      ],
    });
    const blocks = await registry.build(fakeInput, ["inspect"]);
    expect(blocks[0]!.body).toBe("session=s1 project=p1");
  });

  test("build returns empty array when no plugins registered", async () => {
    const registry = createContextRegistry();
    const blocks = await registry.build(fakeInput, ["some_context"]);
    expect(blocks).toHaveLength(0);
  });

  test("build swallows plugin errors and continues", async () => {
    const registry = createContextRegistry();
    registry.register({ id: "good", build: async () => [FakeBlock("g1", "Good")] });
    registry.register({ id: "bad", build: async () => { throw new Error("plugin error"); } });
    registry.register({ id: "also_bad", build: async () => { throw new Error("another error"); } });
    registry.register({ id: "also_good", build: async () => [FakeBlock("g2", "Also Good")] });
    const blocks = await registry.build(fakeInput, ["good", "bad", "also_bad", "also_good"]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.id).toBe("g1");
    expect(blocks[1]!.id).toBe("g2");
  });

  test("observe calls observe on every registered plugin that has it", () => {
    const registry = createContextRegistry();
    const calls: string[] = [];
    registry.register({
      id: "has_observe",
      build: async () => [],
      observe: async (obs) => { calls.push(`observed:${obs.sessionId}`); },
    });
    registry.register({
      id: "no_observe",
      build: async () => [],
      // no observe method
    });
    registry.register({
      id: "also_has_observe",
      build: async () => [],
      observe: async (obs) => { calls.push(`also:${obs.sessionId}`); },
    });

    registry.observe({ sessionId: "s1", projectId: "p1", turnId: "t1", agentRole: "plan", contextId: "x", outputText: "hello", completedAt: "2026-01-01T00:00:00Z", ok: true });
    expect(calls).toEqual(["observed:s1", "also:s1"]);
  });

  test("observe swallows plugin observe errors", () => {
    const registry = createContextRegistry();
    registry.register({
      id: "bad_observe",
      build: async () => [],
      observe: async () => { throw new Error("observe failed"); },
    });
    registry.register({
      id: "good_observe",
      build: async () => [],
      observe: async () => {},
    });
    // Should not throw
    registry.observe({ sessionId: "s1", projectId: "p1", turnId: "t1", agentRole: "plan", contextId: "x", outputText: "", completedAt: "2026-01-01T00:00:00Z", ok: true });
  });
});
