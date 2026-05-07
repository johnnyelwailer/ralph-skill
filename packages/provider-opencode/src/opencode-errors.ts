import type { AgentChunk } from "@aloop/provider";
import { classifyOpencodeFailure } from "./opencode-classify.ts";

export function createErrorChunk(error: unknown, timedOut: boolean): AgentChunk {
  const message = extractErrorMessage(error);
  const failure = classifyOpencodeFailure({ stderr: message, timedOut });
  return { type: "error", content: { classification: failure.classification, message, retriable: failure.retriable } };
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  const record = asRecord(error);
  const data = asRecord(record?.data);
  if (typeof record?.stderr === "string" && record.stderr.length > 0) return record.stderr;
  if (typeof record?.stdout === "string" && record.stdout.length > 0) return record.stdout;
  if (typeof data?.message === "string" && data.message.length > 0) return data.message;
  if (typeof record?.message === "string" && record.message.length > 0) return record.message;
  return "opencode invocation failed";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError" || error.name === "TimeoutError"
    : error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}