/**
 * Trigger types — daemon-owned time/event rules.
 * Spec: docs/spec/api.md §Triggers (line 990)
 */

/** Trigger source kinds */
export type TriggerSourceKind = "time" | "event";

/** Trigger action kinds */
export type TriggerActionKind = "tick_monitor" | "create_research_run" | "queue_orchestrator_trigger" | "emit_alert" | "refresh_projection" | "create_proposal";

/** Scope kinds a trigger can be attached to */
export type TriggerScopeKind = "project" | "workspace" | "incubation_monitor" | "global";

/** Scope of a trigger — which project/workspace/monitor/global it belongs to */
export type TriggerScope = {
  readonly kind: TriggerScopeKind;
  readonly id: string | null; // null for global
};

/** Source filters for event-based triggers */
export type TriggerEventFilters = {
  // topic glob patterns or exact matches to filter on
  readonly topics?: readonly string[];
  // label equality filters
  readonly labels?: Record<string, string>;
  // threshold predicates on metric names
  readonly thresholds?: ReadonlyArray<{ readonly metric: string; readonly op: ">=" | "<="; readonly value: number }>;
};

/** The source that fires a trigger */
export type TriggerSource = {
  readonly kind: TriggerSourceKind;
  // ISO 8601 duration for time-based triggers, e.g. "P7D" for weekly
  readonly schedule?: string;
  // Event topic pattern to listen on (null for time-only triggers)
  readonly topic?: string | null;
  readonly filters?: TriggerEventFilters;
};

/** The action taken when a trigger fires */
export type TriggerAction = {
  readonly kind: TriggerActionKind;
  readonly target: {
    readonly monitor_id?: string;
    readonly research_run_id?: string;
    readonly session_id?: string;
    readonly message?: string;
    // other target fields can be added as needed per kind
  };
};

/** Budget policy for trigger firing */
export type TriggerBudgetPolicy = {
  readonly max_cost_usd_per_fire: number;
};

/** A durable trigger entity persisted to disk */
export type Trigger = {
  readonly id: string;
  readonly scope: TriggerScope;
  readonly source: TriggerSource;
  readonly action: TriggerAction;
  readonly budget_policy: TriggerBudgetPolicy | null;
  readonly debounce_seconds: number;
  readonly enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_fired_at: string | null;
  readonly last_error: string | null;
  readonly fire_count: number;
};

/** Input for creating a new trigger */
export type CreateTriggerInput = {
  readonly scope: TriggerScope;
  readonly source: TriggerSource;
  readonly action: TriggerAction;
  readonly budget_policy?: TriggerBudgetPolicy;
  readonly debounce_seconds?: number;
  readonly enabled?: boolean;
};

/** Input for patching an existing trigger */
export type PatchTriggerInput = {
  readonly scope?: TriggerScope;
  readonly source?: TriggerSource;
  readonly action?: TriggerAction;
  readonly budget_policy?: TriggerBudgetPolicy | null;
  readonly debounce_seconds?: number;
  readonly enabled?: boolean;
};

/** Trigger list filter */
export type TriggerFilter = {
  readonly scope_kind?: TriggerScopeKind;
  readonly scope_id?: string | null;
  readonly enabled?: boolean;
};
