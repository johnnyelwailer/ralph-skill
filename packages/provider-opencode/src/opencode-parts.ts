import type { AgentChunk } from "@aloop/provider";
import type { PromptInfo } from "./opencode-types.ts";

export function translateParts(parts: readonly unknown[]): AgentChunk[] {
  const chunks: AgentChunk[] = [];
  for (const part of parts) {
    const record = asRecord(part);
    if (record?.type === "reasoning" && typeof record.text === "string") chunks.push({ type: "thinking", content: { delta: record.text } });
    if (record?.type === "text" && typeof record.text === "string") chunks.push({ type: "text", content: { delta: record.text } });
    if (record?.type !== "tool") continue;
    if (typeof record.tool === "string") {
      chunks.push({ type: "tool_call", content: { name: record.tool, arguments: JSON.stringify(asRecord(record.state)?.input ?? {}) } });
    }
    const state = asRecord(record.state);
    if (typeof state?.status === "string" && (state.status === "completed" || state.status === "error") && typeof record.callID === "string") {
      chunks.push({ type: "tool_result", content: { id: record.callID, output: stringifyToolOutput(state.output ?? state.error) } });
    }
  }
  return chunks;
}

export function buildUsageChunk(providerId: string, modelId: string, info: PromptInfo): AgentChunk {
  return {
    type: "usage",
    final: true,
    content: {
      providerId,
      modelId,
      tokensIn: info.tokens.input,
      tokensOut: info.tokens.output,
      ...(info.tokens.cache.read > 0 && { cacheRead: info.tokens.cache.read }),
      ...(info.cost > 0 && { costUsd: info.cost }),
    },
  };
}

function stringifyToolOutput(value: unknown): string {
  if (typeof value === "string") return value;
  return value === undefined ? "" : JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}