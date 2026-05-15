import type { AgentChunk, ProviderAdapter, TurnInput } from "@aloop/provider";
import type { SandboxAdapter, SandboxRunOptions, SandboxSessionEnvironment, SandboxTarget } from "@aloop/core";

export type LocalHostSandboxOptions = {
  readonly provider: ProviderAdapter;
  readonly sanitizer?: (extra: Readonly<Record<string, string>> | undefined) => Record<string, string>;
};

export function createLocalHostSandbox(options: LocalHostSandboxOptions): SandboxAdapter {
  return new LocalHostSandboxImpl(options);
}

class LocalHostSandboxImpl implements SandboxAdapter {
  readonly id = "local-host";
  readonly sandboxTarget: SandboxTarget = "host";
  private readonly sessions = new Map<string, SandboxSessionEnvironment>();

  constructor(private readonly options: LocalHostSandboxOptions) {}

  async acquireSession(opts: { sessionId: string; environment: SandboxSessionEnvironment }): Promise<void> {
    this.sessions.set(opts.sessionId, opts.environment);
  }

  async releaseSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async *runTurn(opts: SandboxRunOptions): AsyncGenerator<AgentChunk> {
    const environment = this.sessions.get(opts.sessionId);
    if (!environment) {
      throw new Error(`session not acquired: ${opts.sessionId}`);
    }

    const sanitized = this.options.sanitizer?.({
      AUTH_HANDLE: opts.authHandle,
      ALOOP_SESSION_ID: opts.sessionId,
      ALOOP_WORKTREE: environment.worktreeRoot,
      ALOOP_PROJECT_PATH: environment.projectRoot,
    });

    const baseInput = opts.input;
    const enriched: TurnInput = {
      ...baseInput,
      cwd: environment.projectRoot,
      ...(sanitized && { environment: sanitized }),
    };

    yield* this.options.provider.sendTurn(enriched);
  }

  async dispose(): Promise<void> {
    this.sessions.clear();
  }
}