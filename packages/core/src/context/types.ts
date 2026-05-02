/**
 * Prompt Context — daemon-owned extension point for bounded, source-cited
 * context injected into agent turns.
 *
 * Spec: docs/spec/context.md
 */

/**
 * A normalized context block returned by a context plugin.
 * The daemon renders these into the final prompt body; the provider receives
 * rendered context, not raw plugin API output.
 */
export type ContextBlock = {
  /** Stable id scoped to this block — not a global unique key. */
  readonly id: string;
  /** Human-readable title for the block. */
  readonly title: string;
  /** Content to inject. Rendered as-is — no further daemon processing. */
  readonly body: string;
  /** Citations for any factual claims in body. */
  readonly sources: readonly SourceRef[];
  /** Confidence 0–1 for retrieved/hypothetical content. Omit for direct facts. */
  readonly confidence?: number;
  /** ISO-8601 UTC timestamp when this block was created, if applicable. */
  readonly createdAt?: string;
};

/**
 * A source citation embedded in a ContextBlock.
 * The daemon renders these as footnotes or inline references so the agent can
 * audit provenance.
 */
export type SourceRef = {
  /** Short label shown inline, e.g. "PR #42" or "session #abc". */
  readonly label: string;
  /** URI or file path the label resolves to. May be empty if label is self-evident. */
  readonly uri?: string;
};

/**
 * Input passed to a context plugin's `build` method.
 * Carries everything the plugin needs to produce relevant context.
 */
export type ContextInput = {
  /** The session that is about to run a turn. */
  readonly sessionId: string;
  /** The project that owns the session. */
  readonly projectId: string;
  /** The auth handle scoped to this session. */
  readonly authHandle: string;
  /** The agent role that will receive the prompt (e.g. "plan", "build"). */
  readonly agentRole: string;
  /**
   * The context id being resolved (e.g. "orch_recall", "task_recall").
   * Plugins use this to determine what shape of context to return.
   */
  readonly contextId: string;
  /**
   * Token budget for the total returned ContextBlocks.
   * Plugins MUST respect this ceiling.
   */
  readonly budgetTokens: number;
  /**
   * The worktree root for the project, if one exists.
   * Plugins may use this to read local files.
   */
  readonly worktreeRoot?: string;
};

/**
 * Observation passed to a context plugin's `observe` method after a turn
 * completes. The plugin may use this to index the turn output for future
 * recall, but it MUST NOT mutate tracker or workflow state.
 */
export type TurnObservation = {
  readonly sessionId: string;
  readonly projectId: string;
  readonly turnId: string;
  /** The agent role that just ran. */
  readonly agentRole: string;
  /** The context id this plugin was registered for. */
  readonly contextId: string;
  /** The raw text the provider emitted for this turn. */
  readonly outputText: string;
  /** ISO-8601 UTC timestamp when the turn ended. */
  readonly completedAt: string;
  /** Whether the turn completed without error. */
  readonly ok: boolean;
};

/**
 * Context plugin interface. Plugins adapt one backing system (JSONL projections,
 * MemPalace, Zep, etc.) into Aloop's normalized ContextBlock shape.
 *
 * Registered via a `context-provider` runtime extension manifest.
 */
export type ContextPlugin = {
  readonly id: string;
  build(input: ContextInput): Promise<ContextBlock[]>;
  /** Optional — only needed for plugins that maintain an index. */
  observe?(input: TurnObservation): Promise<void>;
};

/**
 * Parsed form of a context-provider runtime extension manifest (YAML).
 * Shared discipline with pipeline exec steps — YAML is configuration only,
 * checked-in code implements the contract.
 */
export type ContextProviderManifest = {
  readonly kind: "context-provider";
  readonly id: string;
  /** Runtime identifier: "bun" | "node" | "python" | etc. */
  readonly runtime: string;
  /** Path to the entry-point file, relative to the project root. */
  readonly file: string;
  /** Execution timeout, e.g. "10s". */
  readonly timeout: string;
  /** Working directory for the subprocess, typically "repo". */
  readonly cwd: string;
  /** OS platforms the provider runs on. */
  readonly platforms: readonly string[];
  /** Env vars the subprocess is allowed to read. */
  readonly envAllowlist?: readonly string[];
  /** Declared capabilities — used for policy checking before execution. */
  readonly capabilities: ContextCapabilities;
};

/**
 * Capabilities declared in a context-provider manifest.
 * The daemon enforces these before running a provider.
 */
export type ContextCapabilities = {
  /** Read daemon session events (JSONL). */
  readonly readEvents: boolean;
  /** Read tracker state (GitHub, Linear, etc.). */
  readonly readTracker: boolean;
  /** Read daemon metrics (SQLite projections). */
  readonly readMetrics: boolean;
  /** Make outbound network requests. */
  readonly network: boolean;
};
