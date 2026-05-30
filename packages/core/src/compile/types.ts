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

export type PipelinePhase = {
  readonly agent: string;
  readonly repeat?: number;
  readonly onFailure?: TransitionKeyword;
  readonly provider?: ProviderRef;
  readonly model?: string;
  readonly reasoning?: "none" | "low" | "medium" | "high" | "xhigh";
  readonly timeout?: string;
};

/** pipeline.yml — the source of truth authors edit. */
export type PipelineConfig = {
  readonly pipeline: readonly PipelinePhase[];
  readonly finalizer?: readonly string[];
  readonly triggers?: Readonly<Record<string, string>>;
};

/** loop-plan.json — the compiled artifact consumed by the runtime. */
export type LoopPlan = {
  readonly _v: 1;
  readonly cycle: readonly string[];
  readonly finalizer: readonly string[];
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
