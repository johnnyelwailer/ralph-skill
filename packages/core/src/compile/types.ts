/**
 * Pipeline authoring format (pipeline.yml) and the compiled loop-plan.json
 * consumed by the session runner. The compile step in `./pipeline.ts` is the
 * only place YAML is interpreted; the runtime reads only loop-plan.json.
 *
 * See docs/spec/pipeline.md §Workflow vs pipeline vs loop-plan for the full
 * contract. Types here are the minimal v1 shape — additive changes do not
 * bump the loop-plan `version` field; structural changes do.
 */

export type ProviderRef = string | readonly string[];

export type TransitionKeyword =
  | { type: "retry" }
  | { type: "goto"; target: string };

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** pipeline.yml phase — agent variant */
export type AgentPhase = {
  readonly agent: string;
  readonly repeat?: number;
  readonly onFailure?: TransitionKeyword;
  readonly provider?: ProviderRef;
  readonly model?: string;
  readonly reasoning?: ReasoningEffort;
  readonly timeout?: string;
  /** One or more context ids to inject before this phase runs. */
  readonly context?: readonly ContextId[];
};

/**
 * A context declaration in a pipeline phase frontmatter.
 * Three forms:
 *   - string: shorthand for { id: string, budgetTokens: default }
 *   - object with just id
 *   - object with id and budgetTokens override
 */
export type ContextId =
  | string
  | { readonly id: string; readonly budgetTokens?: number };

/** pipeline.yml phase — exec variant (run an external command) */
export type ExecPhase = {
  readonly exec: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly timeout?: string;
  readonly onFailure?: TransitionKeyword;
};

/** pipeline.yml phase — discriminated union of agent and exec variants */
export type PipelinePhase = AgentPhase | ExecPhase;

/** pipeline.yml — the source of truth authors edit. */
export type PipelineConfig = {
  readonly pipeline: readonly PipelinePhase[];
  readonly finalizer?: readonly PipelinePhase[];
  readonly triggers?: Readonly<Record<string, string>>;
};

/** A single entry in the compiled loop-plan cycle. */
export type StepDescriptor =
  | { readonly kind: "agent"; readonly ref: string; readonly reasoning?: ReasoningEffort; readonly context?: readonly ContextId[] }
  | { readonly kind: "exec"; readonly ref: string };

/** loop-plan.json — the compiled artifact consumed by the runtime. */
export type LoopPlan = {
  readonly _v: 1;
  readonly cycle: readonly StepDescriptor[];
  readonly finalizer: readonly StepDescriptor[];
  readonly triggers: Readonly<Record<string, string>>;
  readonly cyclePosition: number;
  readonly finalizerPosition: number;
  readonly iteration: number;
  readonly allTasksMarkedDone: boolean;
  readonly version: number;
  /**
   * Transition rules extracted from pipeline.yml, stored separately so the
   * runtime applies them but the cycle array stays a flat sequence of prompt
   * filenames. Keyed by zero-based cycle position.
   */
  readonly transitions: Readonly<Record<string, TransitionKeyword>>;
};

/** Result of parsing pipeline.yml — ok with a value, or fail with errors. */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export type AffectsCompletedWork = "yes" | "no" | "unknown";

/**
 * A queue entry injected by the steering system. Written to the session's
 * queue/ dir as a JSON file with frontmatter. The loop picks up steering entries
 * next iteration; they preempt the current cycle and reset cyclePosition to 0.
 */
export type SteeringQueueEntry = {
  readonly id: string;
  readonly instruction: string;
  readonly affects_completed_work: AffectsCompletedWork;
  readonly created_at: string;
};

/**
 * Affects how the runtime treats completed work when a steering entry is
 * injected mid-cycle.
 */
export type SteeringOptions = {
  readonly affects_completed_work?: AffectsCompletedWork;
};
