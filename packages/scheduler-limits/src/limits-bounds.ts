/**
 * Hard bounds for Level-2 self-tuning knobs.
 * Source: docs/spec/self-improvement.md §Level-2 Tunable knobs table.
 * These bounds are the containment mechanism for self-tuning (self-improvement.md §Level-2):
 * "The agent can tune inside a box. It cannot resize the box."
 *
 * Bounds enforcement is the primary DGM-resistance mechanism for Level-2.
 * Rejections return error.code = "tune_out_of_bounds" with the violated bound.
 */

export type Bounds = {
  readonly min: number;
  readonly max: number;
};

/** Knobs that have hard numeric bounds. Order matches the spec table. */
export type SchedulerKnobBounds = {
  readonly concurrencyCap: Bounds;
  readonly maxTokensSinceCommit: Bounds;
  readonly minCommitsPerHour: Bounds;
  readonly cpuMaxPct: Bounds;
  readonly memMaxPct: Bounds;
  readonly permitTtlDefaultSeconds: Bounds;
  readonly watchdogStuckThresholdSeconds: Bounds;
};

/**
 * Hard bounds sourced from self-improvement.md §Level-2.
 * These are agent-inaccessible (live outside any worktree).
 * An agent cannot request a value outside these bounds — the request is rejected
 * with error.code = "tune_out_of_bounds" before any state is modified.
 */
export const SCHEDULER_KNOB_BOUNDS: SchedulerKnobBounds = {
  concurrencyCap: { min: 1, max: 8 },
  maxTokensSinceCommit: { min: 100_000, max: 10_000_000 },
  minCommitsPerHour: { min: 0, max: 10 },
  cpuMaxPct: { min: 50, max: 95 },
  memMaxPct: { min: 50, max: 95 },
  permitTtlDefaultSeconds: { min: 120, max: 3600 },
  watchdogStuckThresholdSeconds: { min: 120, max: 3600 },
} as const;

export type BoundViolation = {
  readonly field: string;
  readonly requested: number;
  readonly min: number;
  readonly max: number;
};

/**
 * Validate a numeric value against a bound.
 * Returns a BoundViolation if the value is outside [min, max].
 */
export function checkBound(
  field: string,
  value: number,
  bounds: Bounds,
): BoundViolation | undefined {
  if (value < bounds.min || value > bounds.max) {
    return { field, requested: value, min: bounds.min, max: bounds.max };
  }
  return undefined;
}
