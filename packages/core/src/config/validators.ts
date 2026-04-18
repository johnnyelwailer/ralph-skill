/**
 * Generic field validators used by config loaders. Each validator accepts a
 * raw value, a path string for error reporting, a default, and a mutable
 * errors array; returns the parsed value (or the default on failure, with
 * the failure recorded in errors).
 *
 * Validators never throw — config parsers collect all errors before
 * returning so the user sees every problem in one round.
 */

export function stringField(
  v: unknown,
  path: string,
  def: string,
  errors: string[],
): string {
  if (v === undefined) return def;
  if (typeof v !== "string" || v.length === 0) {
    errors.push(`${path}: must be a non-empty string`);
    return def;
  }
  return v;
}

export function boolField(
  v: unknown,
  path: string,
  def: boolean,
  errors: string[],
): boolean {
  if (v === undefined) return def;
  if (typeof v !== "boolean") {
    errors.push(`${path}: must be a boolean`);
    return def;
  }
  return v;
}

export function posIntField(
  v: unknown,
  path: string,
  def: number,
  errors: string[],
): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    errors.push(`${path}: must be a positive integer`);
    return def;
  }
  return v;
}

export function nonNegIntField(
  v: unknown,
  path: string,
  def: number,
  errors: string[],
): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    errors.push(`${path}: must be a non-negative integer`);
    return def;
  }
  return v;
}

export function posNumField(
  v: unknown,
  path: string,
  def: number,
  errors: string[],
): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    errors.push(`${path}: must be a positive number`);
    return def;
  }
  return v;
}

export function pctField(
  v: unknown,
  path: string,
  def: number,
  errors: string[],
): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
    errors.push(`${path}: must be a number in [0, 100]`);
    return def;
  }
  return v;
}

export function portField(
  v: unknown,
  path: string,
  def: number,
  errors: string[],
): number {
  if (v === undefined) return def;
  if (v === null) return 0; // 0 = pick available; explicit null means "auto"
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 65535) {
    errors.push(`${path}: must be an integer in [0, 65535] or null`);
    return def;
  }
  return v;
}

/** Accept "30s", "5m", "2h", "1d", or a raw number (interpreted as seconds). */
export function durationField(
  v: unknown,
  path: string,
  def: number,
  errors: string[],
): number {
  if (v === undefined) return def;
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v < 0) {
      errors.push(`${path}: numeric duration must be a non-negative integer (seconds)`);
      return def;
    }
    return v;
  }
  if (typeof v === "string") {
    const m = /^(\d+)\s*(s|m|h|d)?$/.exec(v.trim());
    if (!m) {
      errors.push(`${path}: must be a duration like "30s", "5m", "2h", or "1d"`);
      return def;
    }
    const n = Number.parseInt(m[1]!, 10);
    const unit = m[2] ?? "s";
    const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return n * mult;
  }
  errors.push(`${path}: must be a duration string or a non-negative integer (seconds)`);
  return def;
}
