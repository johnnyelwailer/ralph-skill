import type { ProviderFailureClass } from "./health.ts";

export function classifyProviderProbeFailure(err: unknown): ProviderFailureClass {
  const text = errorMessage(err).toLowerCase();
  if (includesAny(text, ["unauthorized", "forbidden", "invalid api key", "auth", "401", "403"])) {
    return "auth";
  }
  if (includesAny(text, ["rate limit", "rate_limit", "quota", "429", "too many requests"])) {
    return "rate_limit";
  }
  if (includesAny(text, ["timeout", "timed out", "etimedout", "econnreset", "eai_again"])) {
    return "timeout";
  }
  if (includesAny(text, ["concurrent", "already running", "another session"])) {
    return "concurrent_cap";
  }
  return "unknown";
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

function includesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
