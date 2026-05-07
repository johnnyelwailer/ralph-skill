import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ReasoningEffort } from "@aloop/provider";
import {
  resolveVariant,
  buildRuntimeEnvironment,
  sanitizeProviderEnvironment,
  withTemporaryEnvironment,
} from "./opencode-env.ts";
import { resolveOpencodeModel, toSdkModel } from "./opencode-model.ts";
import { translateParts, buildUsageChunk } from "./opencode-parts.ts";
import { resolvePromptParts, toSdkPromptParts } from "./opencode-input-parts.ts";
import { createErrorChunk, extractErrorMessage, isAbortError } from "./opencode-errors.ts";

describe("opencode-env", () => {
  describe("resolveVariant", () => {
    test("returns undefined for undefined reasoningEffort", () => {
      expect(resolveVariant(undefined)).toBeUndefined();
    });

    test('returns undefined for "none"', () => {
      expect(resolveVariant("none")).toBeUndefined();
    });

    test('returns "max" for "xhigh"', () => {
      expect(resolveVariant("xhigh")).toBe("max");
    });

    test("returns the value unchanged for standard effort levels", () => {
      for (const effort of ["minimal", "low", "medium", "high"] as ReasoningEffort[]) {
        expect(resolveVariant(effort)).toBe(effort);
      }
    });
  });

  describe("buildRuntimeEnvironment", () => {
    const prevEnv = process.env;

    beforeEach(() => {
      // Isolate process.env changes
      process.env = { ...prevEnv };
    });

    afterEach(() => {
      process.env = prevEnv;
    });

    test("includes session ID as ALOOP_SESSION_ID", () => {
      const result = buildRuntimeEnvironment({ sessionId: "sess-abc", authHandle: "auth", cwd: "/proj" });
      expect(result.ALOOP_SESSION_ID).toBe("sess-abc");
    });

    test("includes auth handle as AUTH_HANDLE", () => {
      const result = buildRuntimeEnvironment({ sessionId: "sess", authHandle: "handle-user", cwd: "/proj" });
      expect(result.AUTH_HANDLE).toBe("handle-user");
    });

    test("includes cwd as ALOOP_PROJECT_PATH and ALOOP_WORKTREE", () => {
      const result = buildRuntimeEnvironment({ sessionId: "sess", authHandle: "auth", cwd: "/my/project" });
      expect(result.ALOOP_PROJECT_PATH).toBe("/my/project");
      expect(result.ALOOP_WORKTREE).toBe("/my/project");
    });

    test("preserves extra environment variables", () => {
      const result = buildRuntimeEnvironment({
        sessionId: "sess",
        authHandle: "auth",
        cwd: "/proj",
        environment: { OPENAI_API_KEY: "sk-test", CUSTOM_VAR: "val" },
      });
      expect(result.OPENAI_API_KEY).toBe("sk-test");
      expect(result.CUSTOM_VAR).toBe("val");
    });

    test("extra environment overrides built-in fields", () => {
      const result = buildRuntimeEnvironment({
        sessionId: "sess",
        authHandle: "auth",
        cwd: "/proj",
        environment: { AUTH_HANDLE: "override-handle" },
      });
      expect(result.AUTH_HANDLE).toBe("override-handle");
    });
  });

  describe("sanitizeProviderEnvironment", () => {
    const prevEnv = process.env;

    beforeEach(() => {
      process.env = { ...prevEnv };
    });

    afterEach(() => {
      process.env = prevEnv;
    });

    test("removes CLAUDECODE from environment copy", () => {
      process.env.CLAUDECODE = "secret-token";
      const result = sanitizeProviderEnvironment(undefined);
      expect(result.CLAUDECODE).toBeUndefined();
    });

    test("preserves all other string env vars", () => {
      process.env.OPENAI_API_KEY = "sk-abc";
      process.env.NODE_ENV = "production";
      const result = sanitizeProviderEnvironment(undefined);
      expect(result.OPENAI_API_KEY).toBe("sk-abc");
      expect(result.NODE_ENV).toBe("production");
    });

    test("extra values override existing env and add new ones", () => {
      process.env.OPENAI_API_KEY = "sk-original";
      const result = sanitizeProviderEnvironment({ OPENAI_API_KEY: "sk-new", EXTRA: "val" });
      expect(result.OPENAI_API_KEY).toBe("sk-new");
      expect(result.EXTRA).toBe("val");
    });
  });

  describe("withTemporaryEnvironment", () => {
    test("sets values during fn execution", async () => {
      await withTemporaryEnvironment({ FOO: "bar" }, [], async () => {
        expect(process.env.FOO).toBe("bar");
      });
    });

    test("removes keys listed in removeKeys during fn execution", async () => {
      process.env.EXISTING = "val";
      await withTemporaryEnvironment({}, ["EXISTING"], async () => {
        expect(process.env.EXISTING).toBeUndefined();
      });
    });

    test("restores original values after fn completes", async () => {
      process.env.EXISTING = "original";
      await withTemporaryEnvironment({ NEW: "val" }, [], async () => {
        process.env.NEW = "changed";
      });
      expect(process.env.EXISTING).toBe("original");
      expect(process.env.NEW).toBeUndefined();
    });

    test("restores original values after fn throws", async () => {
      process.env.RESTORE_ME = "was-here";
      try {
        await withTemporaryEnvironment({}, [], async () => {
          throw new Error("oops");
        });
      } catch (_) { /* expected */ }
      expect(process.env.RESTORE_ME).toBe("was-here");
    });

    test("restores original pre-call values after fn throws", async () => {
      process.env.EXISTING = "original";
      try {
        await withTemporaryEnvironment({ EXISTING: "temp" }, [], async () => {
          process.env.EXISTING = "mutated";
          throw new Error("oops");
        });
      } catch (_) { /* expected */ }
      // Restores to the pre-call value ("original"), not the intermediate value set by withTemporaryEnvironment ("temp")
      expect(process.env.EXISTING).toBe("original");
    });
  });
});

describe("opencode-model", () => {
  describe("resolveOpencodeModel", () => {
    test("rejects provider refs that are not opencode", () => {
      expect(() => resolveOpencodeModel("anthropic/claude-3-5")).toThrow("opencode adapter cannot resolve provider ref");
    });

    test("resolves bare opencode ref to default model", () => {
      const result = resolveOpencodeModel("opencode");
      expect(result.providerId).toBe("opencode");
      expect(result.modelId).toBe("opencode/default");
    });

    test("resolves opencode ref with track and model", () => {
      const result = resolveOpencodeModel("opencode/openrouter/claude@3.5");
      expect(result.providerId).toBe("opencode");
      expect(result.modelId).toBe("openrouter/claude@3.5");
      expect(result.track).toBe("openrouter");
      expect(result.version).toBe("3.5");
    });

    test("resolves opencode ref with track only", () => {
      const result = resolveOpencodeModel("opencode/openrouter");
      expect(result.modelId).toBe("openrouter");
      expect(result.track).toBe("openrouter");
    });

    test("uses custom defaultModelId when provided and model is bare", () => {
      const result = resolveOpencodeModel("opencode", "opencode/custom-default");
      expect(result.modelId).toBe("opencode/custom-default");
    });
  });

  describe("toSdkModel", () => {
    test("splits modelId on first slash into providerID and modelID", () => {
      const result = toSdkModel({ providerId: "opencode", modelId: "openrouter/claude@3.5" });
      expect(result.providerID).toBe("openrouter");
      expect(result.modelID).toBe("claude@3.5");
    });

    test("uses opencode as providerID when modelId has no slash", () => {
      const result = toSdkModel({ providerId: "opencode", modelId: "opencode/default" });
      expect(result.providerID).toBe("opencode");
      expect(result.modelID).toBe("default");
    });
  });
});

describe("opencode-parts", () => {
  describe("translateParts", () => {
    test("translates reasoning part to thinking chunk", () => {
      const parts = [{ id: "p1", type: "reasoning", text: "thinking step" }];
      const chunks = translateParts(parts);
      expect(chunks).toEqual([{ type: "thinking", content: { delta: "thinking step" } }]);
    });

    test("translates text part to text chunk", () => {
      const parts = [{ id: "p1", type: "text", text: "hello world" }];
      const chunks = translateParts(parts);
      expect(chunks).toEqual([{ type: "text", content: { delta: "hello world" } }]);
    });

    test("translates tool part with string tool name to tool_call chunk", () => {
      const parts = [{ id: "p1", type: "tool", tool: "read_file", callID: "c1", state: { input: { path: "a.txt" } } }];
      const chunks = translateParts(parts);
      expect(chunks).toEqual([{ type: "tool_call", content: { name: "read_file", arguments: '{"path":"a.txt"}' } }]);
    });

    test("translates completed tool state to tool_result chunk", () => {
      const parts = [{ id: "p1", type: "tool", tool: "read_file", callID: "c1", state: { status: "completed", input: {}, output: "file contents" } }];
      const chunks = translateParts(parts);
      expect(chunks).toContainEqual({ type: "tool_result", content: { id: "c1", output: "file contents" } });
    });

    test("translates error tool state to tool_result chunk with error output", () => {
      const parts = [{ id: "p1", type: "tool", tool: "read_file", callID: "c2", state: { status: "error", input: {}, error: "ENOENT" } }];
      const chunks = translateParts(parts);
      expect(chunks).toContainEqual({ type: "tool_result", content: { id: "c2", output: "ENOENT" } });
    });

    test("skips tool parts without callID even if completed", () => {
      const parts = [{ id: "p1", type: "tool", tool: "read_file", state: { status: "completed", input: {} } }];
      const chunks = translateParts(parts);
      expect(chunks).toHaveLength(0);
    });
  });

  describe("buildUsageChunk", () => {
    test("returns usage chunk with required fields", () => {
      const info = { tokens: { input: 100, output: 50, cache: { read: 20 } }, cost: 0.05 };
      const chunk = buildUsageChunk("opencode", "claude@3.5", info);
      expect(chunk.type).toBe("usage");
      expect(chunk.final).toBe(true);
      expect(chunk.content).toEqual({
        providerId: "opencode",
        modelId: "claude@3.5",
        tokensIn: 100,
        tokensOut: 50,
        cacheRead: 20,
        costUsd: 0.05,
      });
    });

    test("omits cacheRead when cache.read is 0", () => {
      const info = { tokens: { input: 100, output: 50, cache: { read: 0 } }, cost: 0 };
      const chunk = buildUsageChunk("opencode", "claude@3.5", info);
      expect(chunk.content).not.toHaveProperty("cacheRead");
      expect(chunk.content).not.toHaveProperty("costUsd");
    });
  });
});

describe("opencode-input-parts", () => {
  describe("resolvePromptParts", () => {
    test("returns promptParts when provided and non-empty", () => {
      const parts = [{ type: "text" as const, text: "hello" }];
      expect(resolvePromptParts({ prompt: "ignored", promptParts: parts })).toBe(parts);
    });

    test("wraps prompt string in text part when promptParts is empty", () => {
      const result = resolvePromptParts({ prompt: "hello prompt" });
      expect(result).toEqual([{ type: "text", text: "hello prompt" }]);
    });

    test("returns empty array when promptParts is empty array", () => {
      const result = resolvePromptParts({ prompt: "hello", promptParts: [] });
      expect(result).toEqual([{ type: "text", text: "hello" }]);
    });
  });

  describe("toSdkPromptParts", () => {
    test("translates text part", () => {
      const parts = [{ type: "text", text: "hello" }];
      expect(toSdkPromptParts(parts)).toEqual([{ type: "text", text: "hello" }]);
    });

    test("translates file part with filename", () => {
      const parts = [{ type: "file", mime: "image/png", url: "https://example.com/img.png", filename: "img.png" }];
      expect(toSdkPromptParts(parts)).toEqual([{ type: "file", mime: "image/png", url: "https://example.com/img.png", filename: "img.png" }]);
    });

    test("translates file part without optional filename", () => {
      const parts = [{ type: "file", mime: "image/png", url: "https://example.com/img.png" }];
      const result = toSdkPromptParts(parts);
      expect(result[0]).toEqual({ type: "file", mime: "image/png", url: "https://example.com/img.png" });
      expect(result[0]).not.toHaveProperty("filename");
    });
  });
});

describe("opencode-errors", () => {
  describe("extractErrorMessage", () => {
    test("extracts message from Error instance", () => {
      expect(extractErrorMessage(new Error("test error"))).toBe("test error");
    });

    test("returns string error directly", () => {
      expect(extractErrorMessage("plain string error")).toBe("plain string error");
    });

    test("extracts stderr from record", () => {
      expect(extractErrorMessage({ stderr: "sdk stderr output" })).toBe("sdk stderr output");
    });

    test("extracts stdout from record when stderr not available", () => {
      expect(extractErrorMessage({ stdout: "sdk stdout output" })).toBe("sdk stdout output");
    });

    test("extracts nested data.message", () => {
      expect(extractErrorMessage({ data: { message: "nested message" } })).toBe("nested message");
    });

    test("extracts record.message as fallback", () => {
      expect(extractErrorMessage({ message: "top-level message" })).toBe("top-level message");
    });

    test("returns default message when nothing extracted", () => {
      expect(extractErrorMessage({})).toBe("opencode invocation failed");
      expect(extractErrorMessage(null)).toBe("opencode invocation failed");
      expect(extractErrorMessage(undefined)).toBe("opencode invocation failed");
    });

    test("ignores empty string messages", () => {
      expect(extractErrorMessage(new Error(""))).toBe("opencode invocation failed");
      expect(extractErrorMessage({ stderr: "" })).toBe("opencode invocation failed");
    });
  });

  describe("isAbortError", () => {
    test("returns true for DOMException with AbortError name", () => {
      const err = new DOMException("aborted", "AbortError");
      expect(isAbortError(err)).toBe(true);
    });

    test("returns true for DOMException with TimeoutError name", () => {
      const err = new DOMException("timed out", "TimeoutError");
      expect(isAbortError(err)).toBe(true);
    });

    test("returns true for Error with AbortError name", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      expect(isAbortError(err)).toBe(true);
    });

    test("returns true for Error with TimeoutError name", () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      expect(isAbortError(err)).toBe(true);
    });

    test("returns false for unrelated errors", () => {
      expect(isAbortError(new Error("not abort"))).toBe(false);
      expect(isAbortError({ code: "ETIMEDOUT" })).toBe(false);
    });
  });

  describe("createErrorChunk", () => {
    test("creates error chunk from plain error", () => {
      const chunk = createErrorChunk(new Error("test error"), false);
      expect(chunk.type).toBe("error");
      expect(chunk.content.message).toBe("test error");
      expect(chunk.content.classification).toBe("unknown");
      expect(chunk.content.retriable).toBe(true);
    });

    test("creates error chunk from timeout error", () => {
      const chunk = createErrorChunk(new Error("timed out"), true);
      expect(chunk.content.classification).toBe("timeout");
      expect(chunk.content.retriable).toBe(true);
    });

    test("marks non-retriable auth errors correctly", () => {
      const chunk = createErrorChunk({ stderr: "unauthorized access" }, false);
      expect(chunk.content.classification).toBe("auth");
      expect(chunk.content.retriable).toBe(false);
    });
  });
});
