import type { AgentChunk, TurnInput } from "@aloop/provider";

export type SandboxTarget = "host" | "devcontainer" | "container" | "worker";

export type SandboxSessionEnvironment = {
  readonly sandboxTarget: SandboxTarget;
  readonly worktreeRoot: string;
  readonly projectRoot: string;
  readonly authHandle: string;
};

export type SandboxRunOptions = {
  readonly sessionId: string;
  readonly authHandle: string;
  readonly environment: SandboxSessionEnvironment;
  readonly input: TurnInput;
  readonly signal?: AbortSignal;
};

export interface SandboxAdapter {
  readonly id: string;
  readonly sandboxTarget: SandboxTarget;
  acquireSession(opts: { sessionId: string; environment: SandboxSessionEnvironment }): Promise<void>;
  releaseSession(sessionId: string): Promise<void>;
  runTurn(opts: SandboxRunOptions): AsyncGenerator<AgentChunk>;
  dispose?(): Promise<void> | void;
}