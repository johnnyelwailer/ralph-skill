import type { AgentPhase, ProviderRef, TransitionKeyword } from "./types.ts";

const REASONING_VALUES = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
const MAX_CHAIN_LENGTH = 10;

export function validateReasoning(
  value: unknown,
  path: string,
  errors: string[],
): AgentPhase["reasoning"] | undefined {
  if (typeof value !== "string" || !REASONING_VALUES.has(value)) {
    errors.push(
      `${path}: must be one of ${Array.from(REASONING_VALUES).join(", ")}`,
    );
    return undefined;
  }
  return value as AgentPhase["reasoning"];
}

export function parseTransition(
  value: unknown,
  path: string,
  errors: string[],
): TransitionKeyword | undefined {
  if (typeof value !== "string") {
    errors.push(`${path}: must be a keyword string (e.g. "retry" or "goto build")`);
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "retry") return { type: "retry" };

  const match = /^goto\s+(\S+)$/.exec(trimmed);
  if (match) return { type: "goto", target: match[1]! };

  errors.push(
    `${path}: unknown transition keyword: "${trimmed}" (expected "retry" or "goto <agent>")`,
  );
  return undefined;
}

export function validateProvider(
  value: unknown,
  path: string,
  errors: string[],
): ProviderRef | undefined {
  if (typeof value === "string") {
    if (value.length === 0) {
      errors.push(`${path}: provider string cannot be empty`);
      return undefined;
    }
    return value;
  }

  if (!Array.isArray(value)) {
    errors.push(`${path}: must be a string or an array of strings`);
    return undefined;
  }
  if (value.length === 0) {
    errors.push(`${path}: chain cannot be empty`);
    return undefined;
  }
  if (value.length > MAX_CHAIN_LENGTH) {
    errors.push(`${path}: chain length ${value.length} exceeds cap of ${MAX_CHAIN_LENGTH}`);
    return undefined;
  }

  const chain: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== "string" || entry.length === 0) {
      errors.push(`${path}[${i}]: each chain entry must be a non-empty string`);
      return undefined;
    }
    chain.push(entry);
  }
  return chain;
}
