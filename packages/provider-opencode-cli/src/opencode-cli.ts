import type { ProviderAdapter, ProviderRef, ResolvedModel } from "@aloop/provider";
import { parseProviderRef } from "@aloop/provider";
import { classifyOpencodeFailure } from "./opencode-classify.ts";
import { runOpencodeCli, type OpencodeRunTurn } from "./opencode-runner.ts";

export type CreateOpencodeCliAdapterOptions = {
  readonly defaultModelId?: string;
  readonly runTurn?: OpencodeRunTurn;
};

const DEFAULT_MODEL_ID = "opencode/default";

export function createOpencodeCliAdapter(
  options: CreateOpencodeCliAdapterOptions = {},
): ProviderAdapter {
  const runTurn = options.runTurn ?? runOpencodeCli;

  return {
    id: "opencode-cli",
    capabilities: {
      streaming: false,
      vision: false,
      toolUse: true,
      reasoningEffort: true,
      quotaProbe: false,
      sessionResume: false,
      costReporting: true,
      maxContextTokens: null,
    },
    resolveModel(ref: ProviderRef): ResolvedModel {
      const parsed = parseProviderRef(ref);
      if (parsed.providerId !== "opencode-cli") {
        throw new Error(`opencode-cli adapter cannot resolve provider ref: ${ref}`);
      }
      const modelPath = [parsed.track, parsed.model].filter(Boolean).join("/");
      const versionSuffix = parsed.version ? `@${parsed.version}` : "";
      const modelId = modelPath.length > 0
        ? `${modelPath}${versionSuffix}`
        : options.defaultModelId ?? DEFAULT_MODEL_ID;
      return {
        providerId: "opencode-cli",
        modelId,
        ...(parsed.track && { track: parsed.track }),
        ...(parsed.version && { version: parsed.version }),
      };
    },
    async *sendTurn(input) {
      const resolved = this.resolveModel(input.providerRef);
      const environment = {
        ...input.environment,
        AUTH_HANDLE: input.authHandle,
        ALOOP_SESSION_ID: input.sessionId,
        ALOOP_PROJECT_PATH: input.cwd,
        ALOOP_WORKTREE: input.cwd,
      };
      const variant = resolveVariant(input.reasoningEffort);
      const result = await runTurn({
        modelId: resolved.modelId,
        prompt: input.prompt,
        cwd: input.cwd,
        ...(variant !== undefined && { variant }),
        ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
        environment,
      });

      if (!result.ok) {
        const failure = classifyOpencodeFailure(result);
        yield {
          type: "error",
          content: {
            classification: failure.classification,
            message: result.stderr || result.stdout || "opencode invocation failed",
            retriable: failure.retriable,
          },
        };
        return;
      }

      yield { type: "text", content: { delta: result.text } };
      yield {
        type: "usage",
        content: {
          ...(result.usage?.tokensIn !== undefined && { tokensIn: result.usage.tokensIn }),
          ...(result.usage?.tokensOut !== undefined && { tokensOut: result.usage.tokensOut }),
          ...(result.usage?.cacheRead !== undefined && { cacheRead: result.usage.cacheRead }),
          ...(result.usage?.costUsd !== undefined && { costUsd: result.usage.costUsd }),
          modelId: resolved.modelId,
          providerId: "opencode-cli",
        },
        final: true,
      };
    },
  };
}

function resolveVariant(reasoningEffort: string | undefined): string | undefined {
  switch (reasoningEffort) {
    case undefined:
    case "none":
      return undefined;
    case "xhigh":
      return "max";
    default:
      return reasoningEffort;
  }
}