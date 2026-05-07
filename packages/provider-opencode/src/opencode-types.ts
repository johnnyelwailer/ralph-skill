import type { PromptPart, ReasoningEffort, ResolvedModel } from "@aloop/provider";

export type OpencodeRunInput = {
  readonly modelId: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
};

export type OpencodeRunResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly usage?: {
        readonly tokensIn?: number;
        readonly tokensOut?: number;
        readonly cacheRead?: number;
        readonly costUsd?: number;
      };
      readonly stderr?: string;
    }
  | {
      readonly ok: false;
      readonly stdout?: string;
      readonly stderr?: string;
      readonly exitCode: number | null;
      readonly timedOut?: boolean;
    };

export type OpencodeRunTurn = (input: OpencodeRunInput) => Promise<OpencodeRunResult>;

export type PromptInfo = {
  readonly tokens: { readonly input: number; readonly output: number; readonly cache: { readonly read: number } };
  readonly cost: number;
  readonly error?: unknown;
};

export type PromptPayload = {
  readonly info: PromptInfo;
  readonly parts: readonly unknown[];
};

export type OpencodePromptRequest = {
  readonly cwd: string;
  readonly prompt: string;
  readonly promptParts?: readonly PromptPart[];
  readonly resolvedModel: ResolvedModel;
  readonly reasoningEffort?: ReasoningEffort;
  readonly signal?: AbortSignal;
};

export type OpencodePromptResult = {
  readonly payload?: PromptPayload;
  readonly error?: unknown;
};

export type OpencodeSessionHandle = {
  getSessionId(signal?: AbortSignal): Promise<string>;
  prompt(input: OpencodePromptRequest): Promise<OpencodePromptResult>;
};

export type OpencodeClientFactory = (input: {
  sessionId: string;
  authHandle: string;
  cwd: string;
  timeoutMs?: number;
  environment?: Readonly<Record<string, string>>;
}) => Promise<OpencodeSessionHandle>;

export type CreateOpencodeAdapterOptions = {
  readonly defaultModelId?: string;
  readonly runTurn?: OpencodeRunTurn;
  readonly clientFactory?: OpencodeClientFactory;
};