/**
 * Composer types — fully specified in docs/spec/api.md §Composer.
 * The composer is the universal agentic intent interface.
 */

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export type ComposerTurnScopeKind =
  | "global"
  | "project"
  | "incubation_item"
  | "setup_run"
  | "work_item"
  | "session"
  | "spec_section";

export type ComposerTurnScope =
  | { readonly kind: ComposerTurnScopeKind; readonly id?: string };

// ---------------------------------------------------------------------------
// Media inputs
// ---------------------------------------------------------------------------

export type ComposerMediaInputKind =
  | "image"
  | "audio"
  | "speech"
  | "video"
  | "document"
  | "url"
  | "code"
  | "log"
  | "diff";

export type ComposerMediaInputTranscriptSource =
  | "client"
  | "daemon"
  | "provider"
  | "external"
  | null;

export type ComposerMediaInput = {
  readonly kind: ComposerMediaInputKind;
  readonly artifact_id?: string;
  readonly url?: string | null;
  readonly caption?: string | null;
  readonly transcript_artifact_id?: string | null;
  readonly transcript_text?: string | null;
  readonly transcript_source?: ComposerMediaInputTranscriptSource;
  readonly derived_refs?: readonly string[];
};

// ---------------------------------------------------------------------------
// Context refs
// ---------------------------------------------------------------------------

export type ComposerContextRef =
  | { readonly kind: "project"; readonly project_id: string }
  | { readonly kind: "incubation_item"; readonly item_id: string }
  | { readonly kind: "session"; readonly session_id: string }
  | { readonly kind: "work_item"; readonly work_item_key: string };

// ---------------------------------------------------------------------------
// Intent & delegation
// ---------------------------------------------------------------------------

export type ComposerIntentHint =
  | "capture"
  | "research"
  | "monitor"
  | "project"
  | "setup"
  | "plan"
  | "configure"
  | "steer"
  | "explain"
  | "summarize"
  | "apply";

export type ComposerActionClass =
  | "read"
  | "capture"
  | "research"
  | "project"
  | "setup"
  | "tracker"
  | "runtime"
  | "provider"
  | "scheduler"
  | "config"
  | "artifact";

export type ComposerDelegationPolicy = {
  readonly allow_subagents: boolean;
  readonly max_subagents: number;
  readonly require_preview_for_mutations: boolean;
};

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export type ComposerTranscriptionMode =
  | "auto"
  | "native_provider"
  | "fallback_transcriber"
  | "client_supplied";

export type ComposerTranscription = {
  readonly mode: ComposerTranscriptionMode;
  readonly language?: string;
  readonly allow_client_transcript?: boolean;
};

// ---------------------------------------------------------------------------
// Approval policy
// ---------------------------------------------------------------------------

export type ComposerApprovalPolicy = "preview_required" | "auto_approved";

// ---------------------------------------------------------------------------
// Delegated subagent run (launched child)
// ---------------------------------------------------------------------------

export type ComposerDelegatedRef = {
  readonly kind: "control_subagent_run";
  readonly id: string;
  readonly role: string;
  readonly scope: ComposerTurnScope;
  readonly status: ComposerDelegatedRefStatus;
};

export type ComposerDelegatedRefStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Launched refs — daemon-owned objects created by this turn
// ---------------------------------------------------------------------------

export type ComposerLaunchedRef =
  | { readonly kind: "incubation_item"; readonly id: string }
  | { readonly kind: "research_run"; readonly id: string }
  | { readonly kind: "research_monitor"; readonly id: string }
  | { readonly kind: "setup_run"; readonly id: string }
  | { readonly kind: "session"; readonly id: string };

// ---------------------------------------------------------------------------
// Proposed actions
// ---------------------------------------------------------------------------

export type ComposerProposedAction = {
  readonly id: string;
  readonly class: ComposerActionClass;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly summary: string;
  readonly produced_by: { readonly kind: "control_subagent_run"; readonly id: string };
  readonly risk: "low" | "medium" | "high";
  readonly requires_approval: boolean;
};

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export type ComposerUsage = {
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly cost_usd: number;
};

// ---------------------------------------------------------------------------
// Composer turn status
// ---------------------------------------------------------------------------

export type ComposerTurnStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ComposerMediaMode = "native" | "derived" | "none";

export type ComposerVoiceMode =
  | "native"
  | "transcribed"
  | "client_transcribed"
  | "none";

// ---------------------------------------------------------------------------
// Composer turn (root object)
// ---------------------------------------------------------------------------

export type ComposerTurn = {
  readonly _v: 1;
  readonly id: string;
  readonly scope: ComposerTurnScope;
  readonly message: string;
  readonly artifact_refs: readonly ComposerArtifactRef[];
  readonly media_inputs: readonly ComposerMediaInput[];
  readonly context_refs: readonly ComposerContextRef[];
  readonly intent_hint?: ComposerIntentHint;
  readonly allowed_action_classes: readonly ComposerActionClass[];
  readonly delegation_policy: ComposerDelegationPolicy;
  readonly provider_chain: readonly string[];
  readonly transcription: ComposerTranscription;
  readonly max_cost_usd?: number;
  readonly approval_policy: ComposerApprovalPolicy;
  // Response-only fields (never in create input)
  readonly status: ComposerTurnStatus;
  readonly media_mode: ComposerMediaMode;
  readonly voice_mode: ComposerVoiceMode;
  readonly delegated_refs: readonly ComposerDelegatedRef[];
  readonly launched_refs: readonly ComposerLaunchedRef[];
  readonly proposed_actions: readonly ComposerProposedAction[];
  readonly proposal_refs: readonly string[];
  readonly usage: ComposerUsage;
  readonly created_at: string;
  readonly updated_at: string;
};

// ---------------------------------------------------------------------------
// Artifact ref (in request)
// ---------------------------------------------------------------------------

export type ComposerArtifactRef = {
  readonly artifact_id: string;
  readonly role?: string | null;
  readonly selection?: string | null;
};

// ---------------------------------------------------------------------------
// Create input
// ---------------------------------------------------------------------------

export type CreateComposerTurnInput = {
  readonly id?: string;
  readonly scope: ComposerTurnScope;
  readonly message: string;
  readonly artifact_refs?: readonly ComposerArtifactRef[];
  readonly media_inputs?: readonly ComposerMediaInput[];
  readonly context_refs?: readonly ComposerContextRef[];
  readonly intent_hint?: ComposerIntentHint;
  readonly allowed_action_classes?: readonly ComposerActionClass[];
  readonly delegation_policy?: ComposerDelegationPolicy;
  readonly provider_chain?: readonly string[];
  readonly transcription?: ComposerTranscription;
  readonly max_cost_usd?: number;
  readonly approval_policy?: ComposerApprovalPolicy;
};

// ---------------------------------------------------------------------------
// Filter (for GET /v1/composer/turns)
// ---------------------------------------------------------------------------

export type ComposerTurnFilter = {
  readonly scope_kind?: ComposerTurnScopeKind;
  readonly scope_id?: string;
  readonly status?: ComposerTurnStatus;
  readonly limit?: number;
  readonly cursor?: string;
};
