/**
 * Incubation types — fully specified in docs/spec/incubation.md §Object model.
 * These types are the canonical shape for all incubation-related events and entities.
 */

export type IncubationScope =
  | { readonly kind: "global" }
  | { readonly kind: "project"; readonly project_id: string }
  | { readonly kind: "candidate_project"; readonly abs_path?: string; readonly repo_url?: string };

export type IncubationItemState =
  | "captured"
  | "clarifying"
  | "researching"
  | "synthesized"
  | "ready_for_promotion"
  | "promoted"
  | "discarded"
  | "archived";

export type IncubationPriority = "low" | "normal" | "high";

export type IncubationItemSourceClient =
  | "dashboard"
  | "mobile-web"
  | "cli"
  | "telegram"
  | "browser-extension"
  | "composer"
  | "api";

export type PromotionRef = {
  readonly target_kind: string;
  readonly target_id: string;
  readonly promoted_at: string;
};

export type IncubationItemLinks = {
  readonly project_id?: string;
  readonly artifact_ids?: readonly string[];
  readonly related_item_ids?: readonly string[];
  readonly promoted_refs?: readonly PromotionRef[];
};

export type IncubationItemSource = {
  readonly client: IncubationItemSourceClient;
  readonly captured_at: string;
  readonly author?: string;
  readonly url?: string;
};

/** Root incubation object. See docs/spec/incubation.md §Object model. */
export type IncubationItem = {
  readonly _v: 1;
  readonly id: string;
  readonly scope: IncubationScope;
  readonly title: string;
  readonly body: string;
  readonly state: IncubationItemState;
  readonly labels: readonly string[];
  readonly priority?: IncubationPriority;
  readonly source: IncubationItemSource;
  readonly links: IncubationItemLinks;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly updated_at: string;
};

// ---------------------------------------------------------------------------
// Research run types
// ---------------------------------------------------------------------------

export type ResearchRunMode =
  | "source_synthesis"
  | "monitor_tick"
  | "outreach_analysis"
  | "experiment_loop";

export type ResearchRunPhase =
  | "planning"
  | "question_development"
  | "source_acquisition"
  | "experimenting"
  | "synthesizing"
  | "reporting";

export type ResearchRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/** Research run object. See docs/spec/incubation.md §Research runs. */
export type ResearchRun = {
  readonly _v: 1;
  readonly id: string;
  readonly item_id: string;
  readonly project_id?: string;
  readonly status: ResearchRunStatus;
  readonly mode: ResearchRunMode;
  readonly phase?: ResearchRunPhase;
  readonly question: string;
  readonly provider_chain: readonly string[];
  readonly source_plan?: ResearchSourcePlan;
  readonly experiment_plan?: ExperimentPlan;
  readonly monitor_id?: string;
  readonly cost_usd: number;
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly artifact_ids: readonly string[];
  readonly findings_summary?: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly ended_at?: string;
};

// ---------------------------------------------------------------------------
// Source acquisition types
// ---------------------------------------------------------------------------

export type ResearchSourceKind =
  | "user_attachment"
  | "project_files"
  | "setup_discovery"
  | "web_page"
  | "official_docs"
  | "paper"
  | "repository"
  | "issue_tracker"
  | "forum"
  | "social"
  | "video"
  | "podcast"
  | "market_data"
  | "survey"
  | "manual_note";

export type ResearchSourcePlan = {
  readonly allowed_kinds: readonly ResearchSourceKind[];
  readonly queries?: readonly string[];
  readonly urls?: readonly string[];
  readonly accounts_or_channels?: readonly string[];
  readonly time_window?: { readonly from?: string; readonly to?: string };
  readonly max_sources?: number;
  readonly max_cost_usd?: number;
  readonly require_citations: boolean;
  readonly privacy_classification?: "public" | "private" | "sensitive";
};

// ---------------------------------------------------------------------------
// Experiment loop types
// ---------------------------------------------------------------------------

export type ExperimentPlan = {
  readonly mutable_surface: {
    readonly kind: "file" | "config" | "prompt" | "sandbox_artifact";
    readonly refs: readonly string[];
  };
  readonly immutable_oracle: {
    readonly kind: "command" | "benchmark" | "rubric" | "external_eval";
    readonly ref: string;
    readonly metric: string;
    readonly direction: "minimize" | "maximize";
  };
  readonly attempt_budget: {
    readonly max_attempts?: number;
    readonly max_duration_seconds_per_attempt?: number;
    readonly max_cost_usd?: number;
  };
  readonly decision_rule: {
    readonly keep_if: string;
    readonly revert_or_discard_if: string;
  };
  readonly environment_labels?: Readonly<Record<string, string>>;
  readonly stop_conditions: readonly string[];
};

// ---------------------------------------------------------------------------
// Monitor types
// ---------------------------------------------------------------------------

export type ResearchMonitorStatus = "active" | "paused" | "completed" | "failed" | "cancelled";

export type ResearchMonitorCadence =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | { readonly cron: string };

export type ResearchMonitorEventTrigger = {
  readonly topic: string;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly debounce_seconds?: number;
};

export type ResearchMonitorSynthesisPolicy = {
  readonly mode: "append_findings" | "digest" | "alert_on_change";
  readonly alert_conditions?: readonly string[];
};

/** Long-running monitor object. See docs/spec/incubation.md §Long-running monitors. */
export type ResearchMonitor = {
  readonly _v: 1;
  readonly id: string;
  readonly item_id: string;
  readonly status: ResearchMonitorStatus;
  readonly cadence: ResearchMonitorCadence;
  readonly event_triggers?: readonly ResearchMonitorEventTrigger[];
  readonly question: string;
  readonly mode: "monitor_tick";
  readonly source_plan: ResearchSourcePlan;
  readonly synthesis_policy: ResearchMonitorSynthesisPolicy;
  readonly next_run_at: string;
  readonly last_run_at?: string;
  readonly created_at: string;
  readonly updated_at: string;
};

// ---------------------------------------------------------------------------
// Outreach types
// ---------------------------------------------------------------------------

export type OutreachPlanKind =
  | "survey_plan"
  | "interview_plan"
  | "outreach_message"
  | "response_analysis";

export type OutreachPlanState =
  | "draft"
  | "ready_for_approval"
  | "approved"
  | "collecting"
  | "completed"
  | "cancelled";

export type OutreachPlanSendMode = "manual_export" | "adapter_send";

export type OutreachPlanPersonalDataClassification =
  | "none"
  | "public"
  | "private"
  | "sensitive";

/** Outreach plan object. See docs/spec/incubation.md §Active outreach and surveys. */
export type OutreachPlan = {
  readonly _v: 1;
  readonly id: string;
  readonly item_id: string;
  readonly kind: OutreachPlanKind;
  readonly state: OutreachPlanState;
  readonly title: string;
  readonly target_audience: string;
  readonly draft: string;
  readonly consent_text?: string;
  readonly personal_data_classification: OutreachPlanPersonalDataClassification;
  readonly send_mode: OutreachPlanSendMode;
  readonly approved_snapshot_id?: string;
  readonly artifact_ids: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
};

// ---------------------------------------------------------------------------
// Proposal types
// ---------------------------------------------------------------------------

export type IncubationProposalKind =
  | "setup_candidate"
  | "spec_change"
  | "epic"
  | "story"
  | "steering"
  | "decision_record"
  | "discard";

export type PromotionTarget =
  | { readonly type: "setup_run"; readonly project_abs_path?: string }
  | { readonly type: "spec_change"; readonly file_path: string }
  | { readonly type: "epic"; readonly tracker_ref?: string }
  | { readonly type: "story"; readonly epic_id: string }
  | { readonly type: "steering"; readonly session_id: string }
  | { readonly type: "decision_record" }
  | { readonly type: "discard" };

export type IncubationProposalState = "draft" | "ready" | "applied" | "rejected";

/** Synthesis proposal object. See docs/spec/incubation.md §Synthesis and proposals. */
export type IncubationProposal = {
  readonly _v: 1;
  readonly id: string;
  readonly item_id: string;
  readonly kind: IncubationProposalKind;
  readonly title: string;
  readonly body: string;
  readonly rationale: string;
  readonly evidence_refs: readonly string[];
  readonly target?: PromotionTarget;
  readonly state: IncubationProposalState;
  readonly created_at: string;
  readonly updated_at: string;
};

// ---------------------------------------------------------------------------
// Comment types
// ---------------------------------------------------------------------------

/** Comment on an incubation item. See docs/spec/api.md §Comments. */
export type IncubationItemComment = {
  readonly _v: 1;
  readonly id: string;
  readonly item_id: string;
  readonly author: string;
  readonly body: string;
  readonly created_at: string;
  readonly updated_at: string;
};
