export type ProviderRef = string;
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Opaque auth handle passed to provider adapters.
 * Resolved by the daemon from session context before adapter invocation.
 */
export type AuthHandle = string;

export type ParsedProviderRef = {
  readonly providerId: string;
  readonly track?: string;
  readonly model?: string;
  readonly version?: string;
  readonly canonicalRef: string;
};

export type ResolvedModel = {
  readonly providerId: string;
  readonly modelId: string;
  readonly track?: string;
  readonly version?: string;
};

export type QuotaSnapshot = {
  readonly remaining: number;
  readonly total: number | null;
  readonly resetsAt: string | null;
  readonly currency?: "tokens" | "usd" | "credits";
  readonly probedAt: string;
};

export type Capabilities = {
  readonly streaming: boolean;
  readonly vision: boolean;
  readonly toolUse: boolean;
  readonly reasoningEffort: boolean;
  readonly quotaProbe: boolean;
  readonly sessionResume: boolean;
  readonly costReporting: boolean;
  readonly maxContextTokens: number | null;
};

export type PromptPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "file";
      readonly mime: string;
      readonly url: string;
      readonly filename?: string;
    };

export type TurnInput = {
  readonly sessionId: string;
  readonly authHandle: string;
  readonly providerRef: ProviderRef;
  readonly prompt: string;
  readonly promptParts?: readonly PromptPart[];
  readonly cwd: string;
  readonly reasoningEffort?: ReasoningEffort;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
};

export type UsageChunk = {
  readonly type: "usage";
  readonly content: {
    readonly tokensIn?: number;
    readonly tokensOut?: number;
    readonly cacheRead?: number;
    readonly costUsd?: number;
    readonly modelId?: string;
    readonly providerId?: string;
  };
  readonly final: true;
};

export type ErrorChunk = {
  readonly type: "error";
  readonly content: {
    readonly classification:
      | "rate_limit"
      | "timeout"
      | "auth"
      | "concurrent_cap"
      | "unknown";
    readonly message: string;
    readonly retriable: boolean;
  };
};

export type AgentChunk =
  | { readonly type: "text"; readonly content: { readonly delta: string } }
  | { readonly type: "thinking"; readonly content: { readonly delta: string } }
  | {
      readonly type: "tool_call";
      readonly content: { readonly name: string; readonly arguments: string };
    }
  | {
      readonly type: "tool_result";
      readonly content: { readonly id: string; readonly output: string };
    }
  | UsageChunk
  | ErrorChunk;

export interface ProviderAdapter {
  readonly id: string;
  readonly capabilities: Capabilities;
  resolveModel(ref: ProviderRef): ResolvedModel;
  probeQuota?(auth: AuthHandle): Promise<QuotaSnapshot>;
  sendTurn(input: TurnInput): AsyncGenerator<AgentChunk>;
  dispose?(): Promise<void> | void;
}
