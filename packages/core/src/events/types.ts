/**
 * Session kinds as declared at creation time.  Determines lifecycle rules,
 * worktree semantics, and parent/child relationships — see api.md §Sessions.
 */
export type SessionKind = "standalone" | "orchestrator" | "child";

/**
 * Canonical session status.  Status values are v1-stable per api.md.
 * Terminal statuses (`completed | failed | archived`) may not transition further.
 * Resumable statuses (`interrupted | stopped | paused`) may transition to
 * `running` via `POST /v1/sessions/:id/resume`.
 */
export type SessionStatus =
  | "pending"
  | "running"
  | "paused"
  | "interrupted"
  | "stopped"
  | "completed"
  | "failed"
  | "archived";

/**
 * Canonical event envelope. Every event in every session's JSONL log uses
 * this shape. Topic-specific payloads live in `data`.
 *
 * Envelope fields are stable v1 per api.md. Additive changes (new topics,
 * new fields inside `data`) do not bump `_v`.
 */
export type EventEnvelope<T = unknown> = {
  readonly _v: 1;
  readonly id: string; // monotonic; see makeId
  readonly timestamp: string; // ISO-8601, UTC
  readonly topic: string; // e.g. "session.update", "scheduler.permit.grant"
  readonly data: T;
};

/**
 * Monotonic event-id generator. IDs are lexicographically sortable because
 * both the ms timestamp and sequence counter are fixed-width zero-padded.
 *
 * Format: `{ms:013}.{seq:06}` — 13 digits of ms (room to year ~2286), 6 of seq.
 * The counter resets each ms.
 */
export function makeIdGenerator(now: () => number = Date.now): () => string {
  let lastMs = 0;
  let seq = 0;
  return () => {
    const ms = now();
    if (ms === lastMs) {
      seq += 1;
    } else {
      lastMs = ms;
      seq = 0;
    }
    return `${ms.toString().padStart(13, "0")}.${seq.toString().padStart(6, "0")}`;
  };
}

/** Build an envelope with a generated id and current timestamp. */
export function makeEvent<T>(
  topic: string,
  data: T,
  nextId: () => string,
  now: () => number = Date.now,
): EventEnvelope<T> {
  return {
    _v: 1,
    id: nextId(),
    timestamp: new Date(now()).toISOString(),
    topic,
    data,
  };
}

/**
 * Canonical payload shape for `agent.chunk` events persisted to JSONL.
 *
 * Spec: docs/spec/observability.md §agent.chunk payload shape.
 * The `content` discriminated union covers all five chunk variants:
 *   text / reasoning  — delta string, final=true carries optional summary
 *   usage            — tokens + cost_usd
 *   error            — error string
 *   result           — submit payload (arbitrary)
 */
export type AgentChunkData = {
  readonly session_id: string;
  readonly turn_id: string;
  /** Set when this turn belongs to an orchestrator session. */
  readonly parent_id?: string;
  /** Monotonically increasing per turn. */
  readonly sequence: number;
  readonly type: "text" | "reasoning" | "usage" | "error" | "result";
  readonly content: {
    /** For type=text or type=reasoning. */
    readonly delta?: string;
    /** Present on the final chunk of a turn. */
    readonly summary?: string;
    /** For type=usage. */
    readonly tokens?: number;
    /** For type=usage. */
    readonly cost_usd?: number;
    /** For type=error. */
    readonly error?: string;
    /** For type=result — the submit payload. */
    readonly result?: unknown;
  };
  /** True = last chunk for this turn. */
  readonly final: boolean;
};

/**
 * Canonical payload shape for `daemon.log` events — daemon stdout relayed over SSE.
 *
 * Spec: docs/spec/observability.md §daemon.* — daemon.log.
 */
export type DaemonLogData = {
  readonly level: string;
  readonly message: string;
  readonly fields?: Record<string, unknown>;
};

/**
 * Canonical payload shape for `warning.dropped` events — SSE client buffer overflow.
 *
 * Spec: docs/spec/observability.md §warning.* — warning.dropped.
 */
export type WarningDroppedData = {
  readonly dropped_count: number;
};

/**
 * Canonical payload shape for `provider.health` events.
 *
 * Spec: docs/spec/observability.md §provider.* — provider.health.
 * The provider adapter emits this when cooldown enters/exits or when failure
 * classification is updated.
 */
export type ProviderHealthData = {
  readonly provider_id: string;
  readonly status: "ok" | "cooldown" | "unavailable";
  readonly cooldown_until?: string; // ISO-8601; present when status is "cooldown"
  readonly failure_class?: "rate_limit" | "auth" | "network" | "server_error" | "unknown";
  readonly message?: string;
};
