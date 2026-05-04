/**
 * Composer turn registry — SQLite-backed store.
 * See docs/spec/api.md §Composer.
 */
import type { Database } from "bun:sqlite";
import type {
  ComposerActionClass,
  ComposerApprovalPolicy,
  ComposerArtifactRef,
  ComposerContextRef,
  ComposerDelegatedRef,
  ComposerDelegationPolicy,
  ComposerIntentHint,
  ComposerLaunchedRef,
  ComposerMediaInput,
  ComposerMediaMode,
  ComposerProposedAction,
  ComposerTranscription,
  ComposerTranscriptionMode,
  ComposerTurn,
  ComposerTurnFilter,
  ComposerTurnScope,
  ComposerTurnScopeKind,
  ComposerTurnStatus,
  ComposerUsage,
  ComposerVoiceMode,
  CreateComposerTurnInput,
} from "@aloop/core";

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

type ComposerTurnRow = {
  id: string;
  scope_kind: string;
  scope_id: string | null;
  message: string;
  artifact_refs: string;
  media_inputs: string;
  context_refs: string;
  intent_hint: string | null;
  allowed_action_classes: string;
  delegation_policy: string;
  provider_chain: string;
  transcription: string;
  max_cost_usd: number | null;
  approval_policy: string;
  status: string;
  media_mode: string;
  voice_mode: string;
  delegated_refs: string;
  launched_refs: string;
  proposed_actions: string;
  proposal_refs: string;
  usage_tokens_in: number;
  usage_tokens_out: number;
  usage_cost_usd: number;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function parseJSON<T>(val: string, fallback: T): T {
  if (!val || val === "") return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function scopeFromRow(row: ComposerTurnRow): ComposerTurnScope {
  return { kind: row.scope_kind as ComposerTurnScopeKind, id: row.scope_id ?? undefined };
}

function turnFromRow(row: ComposerTurnRow): ComposerTurn {
  return {
    _v: 1,
    id: row.id,
    scope: scopeFromRow(row),
    message: row.message,
    artifact_refs: parseJSON(row.artifact_refs, []),
    media_inputs: parseJSON(row.media_inputs, []),
    context_refs: parseJSON(row.context_refs, []),
    intent_hint: (row.intent_hint ?? undefined) as ComposerIntentHint | undefined,
    allowed_action_classes: parseJSON(row.allowed_action_classes, []),
    delegation_policy: parseJSON(row.delegation_policy, {
      allow_subagents: true,
      max_subagents: 3,
      require_preview_for_mutations: true,
    }),
    provider_chain: parseJSON(row.provider_chain, []),
    transcription: parseJSON(row.transcription, { mode: "auto" as ComposerTranscriptionMode }),
    max_cost_usd: row.max_cost_usd ?? undefined,
    approval_policy: row.approval_policy as ComposerApprovalPolicy,
    status: row.status as ComposerTurnStatus,
    media_mode: row.media_mode as ComposerMediaMode,
    voice_mode: row.voice_mode as ComposerVoiceMode,
    delegated_refs: parseJSON(row.delegated_refs, []),
    launched_refs: parseJSON(row.launched_refs, []),
    proposed_actions: parseJSON(row.proposed_actions, []),
    proposal_refs: parseJSON(row.proposal_refs, []),
    usage: {
      tokens_in: row.usage_tokens_in,
      tokens_out: row.usage_tokens_out,
      cost_usd: row.usage_cost_usd,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ComposerTurnNotFoundError extends Error {
  readonly code = "composer_turn_not_found" as const;
  constructor(readonly id: string) {
    super(`Composer turn not found: ${id}`);
    this.name = "ComposerTurnNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// ComposerTurnRegistry
// ---------------------------------------------------------------------------

export class ComposerTurnRegistry {
  constructor(private readonly db: Database) {}

  /**
   * Create a new composer turn.
   * Defaults all response-only fields to their initial values.
   */
  create(input: CreateComposerTurnInput & { now?: string }): ComposerTurn {
    const id = input.id ?? crypto.randomUUID();
    const now = input.now ?? new Date().toISOString();

    const scopeKind = input.scope.kind;
    const scopeId = input.scope.id ?? null;

    const delegationPolicy = input.delegation_policy ?? {
      allow_subagents: true,
      max_subagents: 3,
      require_preview_for_mutations: true,
    };

    const transcription = input.transcription ?? { mode: "auto" as ComposerTranscriptionMode };

    this.db.run(
      `INSERT INTO composer_turns (
        id, scope_kind, scope_id, message,
        artifact_refs, media_inputs, context_refs,
        intent_hint, allowed_action_classes, delegation_policy,
        provider_chain, transcription, max_cost_usd, approval_policy,
        status, media_mode, voice_mode,
        delegated_refs, launched_refs, proposed_actions, proposal_refs,
        usage_tokens_in, usage_tokens_out, usage_cost_usd,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        scopeKind,
        scopeId,
        input.message,
        JSON.stringify(input.artifact_refs ?? []),
        JSON.stringify(input.media_inputs ?? []),
        JSON.stringify(input.context_refs ?? []),
        input.intent_hint ?? null,
        JSON.stringify(input.allowed_action_classes ?? []),
        JSON.stringify(delegationPolicy),
        JSON.stringify(input.provider_chain ?? []),
        JSON.stringify(transcription),
        input.max_cost_usd ?? null,
        input.approval_policy ?? "preview_required",
        "queued",
        "none",
        "none",
        "[]",
        "[]",
        "[]",
        "[]",
        0,
        0,
        0,
        now,
        now,
      ],
    );

    return this.getById(id);
  }

  /** Get a single turn by id. Throws ComposerTurnNotFoundError if not found. */
  getById(id: string): ComposerTurn {
    const row = this.db
      .query<ComposerTurnRow, [string]>(`SELECT * FROM composer_turns WHERE id = ?`)
      .get(id);
    if (!row) throw new ComposerTurnNotFoundError(id);
    return turnFromRow(row);
  }

  /**
   * List turns with optional filter.
   * Results ordered by created_at DESC (most recent first).
   * Supports cursor-based pagination via created_at of last item.
   */
  list(filter: ComposerTurnFilter = {}): ComposerTurn[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.scope_kind) {
      conditions.push(`scope_kind = ?`);
      params.push(filter.scope_kind);
    }
    if (filter.scope_id) {
      conditions.push(`scope_id = ?`);
      params.push(filter.scope_id);
    }
    if (filter.status) {
      conditions.push(`status = ?`);
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(filter.limit ?? 20, 100);
    const cursorClause = filter.cursor ? `AND created_at < ?` : "";

    const rows = this.db
      .query<ComposerTurnRow, (string | number)[]>(
        `SELECT * FROM composer_turns ${where} ${cursorClause} ORDER BY created_at DESC LIMIT ?`,
      )
      .all([...params, ...(filter.cursor ? [filter.cursor] : []), limit]);

    return rows.map(turnFromRow);
  }

  /** Update the status of an existing turn. Throws if not found. */
  updateStatus(id: string, status: ComposerTurnStatus, now?: string): ComposerTurn {
    const n = now ?? new Date().toISOString();
    const result = this.db
      .query<{ changes: number }, [string, string, string]>(
        `UPDATE composer_turns SET status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, n, id);
    if (result.changes === 0) throw new ComposerTurnNotFoundError(id);
    return this.getById(id);
  }

  /** Update response-only fields. Throws if not found. */
  updateResponse(
    id: string,
    patch: {
      status?: ComposerTurnStatus;
      media_mode?: ComposerMediaMode;
      voice_mode?: ComposerVoiceMode;
      delegated_refs?: readonly ComposerDelegatedRef[];
      launched_refs?: readonly ComposerLaunchedRef[];
      proposed_actions?: readonly ComposerProposedAction[];
      proposal_refs?: readonly string[];
      usage?: ComposerUsage;
      now?: string;
    },
  ): ComposerTurn {
    const n = patch.now ?? new Date().toISOString();
    const current = this.getById(id);
    const merged: ComposerTurn = {
      ...current,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.media_mode !== undefined ? { media_mode: patch.media_mode } : {}),
      ...(patch.voice_mode !== undefined ? { voice_mode: patch.voice_mode } : {}),
      ...(patch.delegated_refs !== undefined ? { delegated_refs: patch.delegated_refs } : {}),
      ...(patch.launched_refs !== undefined ? { launched_refs: patch.launched_refs } : {}),
      ...(patch.proposed_actions !== undefined ? { proposed_actions: patch.proposed_actions } : {}),
      ...(patch.proposal_refs !== undefined ? { proposal_refs: patch.proposal_refs } : {}),
      ...(patch.usage !== undefined ? { usage: patch.usage } : {}),
      updated_at: n,
    };

    this.db.run(
      `UPDATE composer_turns SET
        status = ?, media_mode = ?, voice_mode = ?,
        delegated_refs = ?, launched_refs = ?,
        proposed_actions = ?, proposal_refs = ?,
        usage_tokens_in = ?, usage_tokens_out = ?, usage_cost_usd = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        merged.status,
        merged.media_mode,
        merged.voice_mode,
        JSON.stringify(merged.delegated_refs),
        JSON.stringify(merged.launched_refs),
        JSON.stringify(merged.proposed_actions),
        JSON.stringify(merged.proposal_refs),
        merged.usage.tokens_in,
        merged.usage.tokens_out,
        merged.usage.cost_usd,
        n,
        id,
      ],
    );

    return this.getById(id);
  }

  /** Hard-delete a turn. Throws if not found. */
  delete(id: string): void {
    const result = this.db
      .query<{ changes: number }, [string]>(`DELETE FROM composer_turns WHERE id = ?`)
      .run(id);
    if (result.changes === 0) throw new ComposerTurnNotFoundError(id);
  }
}
