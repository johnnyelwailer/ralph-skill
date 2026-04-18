/**
 * Two-sided CUSUM changepoint detector.
 *
 * Maintains running positive and negative cumulative sums around a target mean.
 * An alarm fires when either side exceeds a threshold, indicating the underlying
 * mean has shifted.
 *
 * Tunable parameters:
 *   - target: nominal mean of the "healthy" stream
 *   - k     : slack / reference — half the minimum shift worth detecting (in
 *             the stream's units). Larger k = more insensitive, fewer false alarms.
 *   - h     : alarm threshold. Typical choice: h = 4 * sigma for shifts of ~1 sigma.
 *
 * Formulas:
 *   S_pos(t) = max(0, S_pos(t-1) + (x_t - target - k))
 *   S_neg(t) = max(0, S_neg(t-1) + (target - x_t - k))
 *   Alarm iff S_pos > h  OR  S_neg > h
 *
 * Reset-on-alarm is the caller's choice (returned flag + `reset` helper).
 */
export type CusumParams = {
  readonly target: number;
  readonly k: number;
  readonly h: number;
};

export type CusumState = {
  readonly params: CusumParams;
  readonly sHi: number; // accumulates above-target drift
  readonly sLo: number; // accumulates below-target drift
};

export type CusumUpdate = {
  readonly state: CusumState;
  readonly alarm: "none" | "upward" | "downward";
};

export function cusumInit(params: CusumParams): CusumState {
  return { params, sHi: 0, sLo: 0 };
}

export function cusumUpdate(state: CusumState, x: number): CusumUpdate {
  const { target, k, h } = state.params;
  const sHi = Math.max(0, state.sHi + (x - target - k));
  const sLo = Math.max(0, state.sLo + (target - x - k));
  const next: CusumState = { params: state.params, sHi, sLo };
  const alarm: CusumUpdate["alarm"] = sHi > h ? "upward" : sLo > h ? "downward" : "none";
  return { state: next, alarm };
}

/** Reset accumulators after an alarm so the detector can catch the next shift. */
export function cusumReset(state: CusumState): CusumState {
  return { params: state.params, sHi: 0, sLo: 0 };
}
