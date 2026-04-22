export type ProviderRef = string;

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

export type TurnInput = {
  readonly sessionId: string;
  readonly authHandle: string;
  readonly providerRef: ProviderRef;
  readonly prompt: string;
  readonly cwd: string;
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
  probeQuota?(authHandle: string): Promise<QuotaSnapshot>;
  sendTurn(input: TurnInput): AsyncGenerator<AgentChunk>;
}
