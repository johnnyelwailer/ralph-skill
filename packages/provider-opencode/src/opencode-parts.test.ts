import { describe, expect, test } from "bun:test";
import { buildUsageChunk, translateParts } from "./opencode-parts";

describe("translateParts", () => {
  test("returns empty array for empty input", () => {
    expect(translateParts([])).toEqual([]);
  });

  test("ignores null/undefined parts", () => {
    expect(translateParts([null, undefined, 42])).toEqual([]);
  });

  test("translates reasoning part to thinking chunk", () => {
    const input = [{ id: "r1", type: "reasoning", text: "thinking step" }];
    expect(translateParts(input)).toEqual([
      { type: "thinking", content: { delta: "thinking step" } },
    ]);
  });

  test("translates text part to text chunk", () => {
    const input = [{ id: "t1", type: "text", text: "hello world" }];
    expect(translateParts(input)).toEqual([
      { type: "text", content: { delta: "hello world" } },
    ]);
  });

  test("translates multiple reasoning and text parts in order", () => {
    const input = [
      { id: "r1", type: "reasoning", text: "plan" },
      { id: "t1", type: "text", text: "action" },
    ];
    expect(translateParts(input)).toEqual([
      { type: "thinking", content: { delta: "plan" } },
      { type: "text", content: { delta: "action" } },
    ]);
  });

  test("translates tool part with string tool and callID to tool_call chunk", () => {
    const input = [
      { id: "tool1", type: "tool", callID: "call_1", tool: "read_file", state: { input: { path: "a.txt" } } },
    ];
    expect(translateParts(input)).toEqual([
      { type: "tool_call", content: { name: "read_file", arguments: '{"path":"a.txt"}' } },
    ]);
  });

  test("translates tool call with completed state to tool_result chunk after tool_call", () => {
    const input = [
      { id: "tool1", type: "tool", callID: "call_1", tool: "read_file", state: { status: "completed", input: { path: "a.txt" }, output: "file contents" } },
    ];
    expect(translateParts(input)).toEqual([
      { type: "tool_call", content: { name: "read_file", arguments: '{"path":"a.txt"}' } },
      { type: "tool_result", content: { id: "call_1", output: "file contents" } },
    ]);
  });

  test("translates tool call with error state to tool_result chunk containing error", () => {
    const input = [
      { id: "tool1", type: "tool", callID: "call_2", tool: "write_file", state: { status: "error", input: { path: "b.txt" }, error: "Permission denied" } },
    ];
    expect(translateParts(input)).toEqual([
      { type: "tool_call", content: { name: "write_file", arguments: '{"path":"b.txt"}' } },
      { type: "tool_result", content: { id: "call_2", output: "Permission denied" } },
    ]);
  });

  test("tool without callID does not emit tool_call or tool_result", () => {
    const input = [
      { id: "tool1", type: "tool", tool: "read_file", state: { status: "completed" } },
    ];
    expect(translateParts(input)).toEqual([]);
  });

  test("tool without valid state does not emit tool_result", () => {
    const input = [
      { id: "tool1", type: "tool", callID: "call_1", tool: "read_file" },
    ];
    expect(translateParts(input)).toEqual([
      { type: "tool_call", content: { name: "read_file", arguments: "{}" } },
    ]);
  });

  test("stringifies tool arguments as JSON", () => {
    const input = [
      { id: "tool1", type: "tool", callID: "call_x", tool: "bash", state: { input: { command: "ls -la", env: { HOME: "/home/user" } } } },
    ];
    expect(translateParts(input)).toEqual([
      { type: "tool_call", content: { name: "bash", arguments: '{"command":"ls -la","env":{"HOME":"/home/user"}}' } },
    ]);
  });

  test("handles mixed tool, reasoning, and text parts", () => {
    const input = [
      { id: "r1", type: "reasoning", text: "thinking" },
      { id: "t1", type: "text", text: "doing thing" },
      { id: "tool1", type: "tool", callID: "call_1", tool: "ls", state: { status: "completed", input: {}, output: "a\nb" } },
      { id: "t2", type: "text", text: "done" },
    ];
    expect(translateParts(input)).toEqual([
      { type: "thinking", content: { delta: "thinking" } },
      { type: "text", content: { delta: "doing thing" } },
      { type: "tool_call", content: { name: "ls", arguments: "{}" } },
      { type: "tool_result", content: { id: "call_1", output: "a\nb" } },
      { type: "text", content: { delta: "done" } },
    ]);
  });

  test("tool result with undefined output emits empty string", () => {
    // stringifyToolOutput(undefined) returns "" — undefined signals no output collected yet
    const input = [
      { id: "tool1", type: "tool", callID: "call_1", tool: "read_file", state: { status: "completed", input: { path: "a.txt" } } },
    ];
    expect(translateParts(input)).toEqual([
      { type: "tool_call", content: { name: "read_file", arguments: '{"path":"a.txt"}' } },
      { type: "tool_result", content: { id: "call_1", output: "" } },
    ]);
  });
});

describe("buildUsageChunk", () => {
  const providerId = "opencode";
  const modelId = "openrouter/claude@3.5";

  test("includes cacheRead when tokens.cache.read > 0", () => {
    const info = { tokens: { input: 100, output: 50, cache: { read: 25 } }, cost: 0.005 };
    const chunk = buildUsageChunk(providerId, modelId, info);
    expect(chunk).toEqual({
      type: "usage",
      final: true,
      content: {
        providerId: "opencode",
        modelId: "openrouter/claude@3.5",
        tokensIn: 100,
        tokensOut: 50,
        cacheRead: 25,
        costUsd: 0.005,
      },
    });
  });

  test("omits cacheRead when tokens.cache.read is 0", () => {
    const info = { tokens: { input: 100, output: 50, cache: { read: 0 } }, cost: 0.005 };
    const chunk = buildUsageChunk(providerId, modelId, info);
    expect(chunk.content).not.toHaveProperty("cacheRead");
    expect(chunk.content).toHaveProperty("costUsd", 0.005);
  });

  test("omits costUsd when cost is 0", () => {
    const info = { tokens: { input: 100, output: 50, cache: { read: 0 } }, cost: 0 };
    const chunk = buildUsageChunk(providerId, modelId, info);
    expect(chunk.content).not.toHaveProperty("cacheRead");
    expect(chunk.content).not.toHaveProperty("costUsd");
  });

  test("includes both cacheRead and costUsd when both are non-zero", () => {
    const info = { tokens: { input: 100, output: 50, cache: { read: 10 } }, cost: 0.02 };
    const chunk = buildUsageChunk(providerId, modelId, info);
    expect(chunk.content.cacheRead).toBe(10);
    expect(chunk.content.costUsd).toBe(0.02);
  });

  test("always includes providerId, modelId, tokensIn, tokensOut", () => {
    const info = { tokens: { input: 1, output: 1, cache: { read: 0 } }, cost: 0 };
    const chunk = buildUsageChunk(providerId, modelId, info);
    expect(chunk.content.providerId).toBe("opencode");
    expect(chunk.content.modelId).toBe("openrouter/claude@3.5");
    expect(chunk.content.tokensIn).toBe(1);
    expect(chunk.content.tokensOut).toBe(1);
  });
});
