import type { AgentChunk, ProviderAdapter } from "@aloop/provider";
import { OPENCODE_CAPABILITIES } from "./opencode-capabilities.ts";
import { buildRuntimeEnvironment, withTemporaryEnvironment } from "./opencode-env.ts";
import { createErrorChunk, isAbortError } from "./opencode-errors.ts";
import { resolvePromptParts } from "./opencode-input-parts.ts";
import { resolveOpencodeModel } from "./opencode-model.ts";
import { buildUsageChunk, translateParts } from "./opencode-parts.ts";
import { __sdkTestHooks, getDefaultSessionHandle } from "./opencode-sdk.ts";
import type { CreateOpencodeAdapterOptions, OpencodeRunTurn } from "./opencode-types.ts";

export type { CreateOpencodeAdapterOptions, OpencodeRunInput, OpencodeRunResult, OpencodeRunTurn } from "./opencode-types.ts";

export const __testHooks = { withTemporaryEnvironment, ...__sdkTestHooks };

export function createOpencodeAdapter(options: CreateOpencodeAdapterOptions = {}): ProviderAdapter {
  const clientFactory = options.clientFactory ?? getDefaultSessionHandle;
  return {
    id: "opencode",
    capabilities: OPENCODE_CAPABILITIES,
    resolveModel(ref) {
      return resolveOpencodeModel(ref, options.defaultModelId);
    },
    async dispose() {
      await __sdkTestHooks.resetCachedServers();
    },
    async *sendTurn(input) {
      const resolved = this.resolveModel(input.providerRef);
      if (options.runTurn) return yield* sendTurnViaRunner(options.runTurn, input, resolved);
      const signal = input.timeoutMs !== undefined ? AbortSignal.timeout(input.timeoutMs) : undefined;
      let handle;
      try {
        handle = await clientFactory({
          sessionId: input.sessionId,
          authHandle: input.authHandle,
          cwd: input.cwd,
          ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
          ...(input.environment && { environment: input.environment }),
        });
      } catch (error) {
        return yield createErrorChunk(error, isAbortError(error));
      }
      let result;
      try {
        result = await handle.prompt({
          cwd: input.cwd,
          prompt: input.prompt,
          promptParts: resolvePromptParts(input),
          resolvedModel: resolved,
          ...(input.reasoningEffort !== undefined && { reasoningEffort: input.reasoningEffort }),
          ...(signal && { signal }),
        });
      } catch (error) {
        return yield createErrorChunk(error, isAbortError(error));
      }
      if (result.error) return yield createErrorChunk(result.error, false);
      if (!result.payload) return yield createErrorChunk(new Error("opencode server returned no data"), false);
      if (result.payload.info.error) return yield createErrorChunk(result.payload.info.error, false);
      for (const chunk of translateParts(result.payload.parts)) yield chunk;
      yield buildUsageChunk("opencode", resolved.modelId, result.payload.info);
    },
  };
}

async function* sendTurnViaRunner(
  runTurn: OpencodeRunTurn,
  input: Parameters<ProviderAdapter["sendTurn"]>[0],
  resolved: ReturnType<ProviderAdapter["resolveModel"]>,
): AsyncGenerator<AgentChunk> {
  const result = await runTurn({
    modelId: resolved.modelId,
    prompt: input.prompt,
    cwd: input.cwd,
    ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
    environment: buildRuntimeEnvironment(input),
  });
  if (!result.ok) return yield createErrorChunk(result, Boolean(result.timedOut));
  yield { type: "text", content: { delta: result.text } };
  yield {
    type: "usage",
    final: true,
    content: {
      providerId: "opencode",
      modelId: resolved.modelId,
      ...(result.usage?.tokensIn !== undefined && { tokensIn: result.usage.tokensIn }),
      ...(result.usage?.tokensOut !== undefined && { tokensOut: result.usage.tokensOut }),
      ...(result.usage?.cacheRead !== undefined && { cacheRead: result.usage.cacheRead }),
      ...(result.usage?.costUsd !== undefined && { costUsd: result.usage.costUsd }),
    },
  };
}