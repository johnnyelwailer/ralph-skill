import type { ProviderFailureClass } from "@aloop/provider";

export type ClassifiedFailure = {
  readonly classification: ProviderFailureClass;
  readonly retriable: boolean;
};

export function classifyOpencodeFailure(input: {
  stderr?: string;
  stdout?: string;
  timedOut?: boolean;
}): ClassifiedFailure {
  if (input.timedOut) return { classification: "timeout", retriable: true };
  const text = `${input.stderr ?? ""}\n${input.stdout ?? ""}`.toLowerCase();

  if (includesAny(text, ["rate limit", "429", "quota", "too many requests"])) {
    return { classification: "rate_limit", retriable: true };
  }
  if (includesAny(text, ["timed out", "timeout", "etimedout"])) {
    return { classification: "timeout", retriable: true };
  }
  if (includesAny(text, ["unauthorized", "forbidden", "invalid api key", "auth"])) {
    return { classification: "auth", retriable: false };
  }
  if (includesAny(text, ["another session", "already running", "concurrent"])) {
    return { classification: "concurrent_cap", retriable: true };
  }
  return { classification: "unknown", retriable: true };
}

function includesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
