/**
 * Welford's online algorithm for numerically-stable running mean and variance.
 *
 *   delta_1 = x_n - mean_{n-1}
 *   mean_n  = mean_{n-1} + delta_1 / n
 *   delta_2 = x_n - mean_n
 *   M2_n    = M2_{n-1} + delta_1 * delta_2
 *
 *   sample_variance     = M2 / (n - 1)   // Bessel's correction
 *   population_variance = M2 / n
 *
 * Single-pass, O(1) memory per stream, overflow-resistant for realistic ranges.
 */
export type WelfordState = {
  readonly count: number;
  readonly mean: number;
  readonly m2: number;
};

export function welfordInit(): WelfordState {
  return { count: 0, mean: 0, m2: 0 };
}

export function welfordUpdate(state: WelfordState, x: number): WelfordState {
  const count = state.count + 1;
  const delta = x - state.mean;
  const mean = state.mean + delta / count;
  const delta2 = x - mean;
  const m2 = state.m2 + delta * delta2;
  return { count, mean, m2 };
}

export function welfordMean(state: WelfordState): number {
  return state.mean;
}

export function welfordSampleVariance(state: WelfordState): number {
  return state.count < 2 ? 0 : state.m2 / (state.count - 1);
}

export function welfordPopulationVariance(state: WelfordState): number {
  return state.count < 1 ? 0 : state.m2 / state.count;
}

export function welfordSampleStdDev(state: WelfordState): number {
  return Math.sqrt(welfordSampleVariance(state));
}

/** Merge two Welford states (parallel/batched reduction). */
export function welfordMerge(a: WelfordState, b: WelfordState): WelfordState {
  if (a.count === 0) return b;
  if (b.count === 0) return a;
  const count = a.count + b.count;
  const delta = b.mean - a.mean;
  const mean = a.mean + (delta * b.count) / count;
  const m2 = a.m2 + b.m2 + delta * delta * ((a.count * b.count) / count);
  return { count, mean, m2 };
}
