import type { PipelinePhase, ProviderRef, TransitionKeyword } from "./types.ts";

const REASONING_VALUES = new Set(["none", "low", "medium", "high", "xhigh"]);
const MAX_CHAIN_LENGTH = 10;

type MutablePhase = {
  agent: string;
  repeat?: number;
  onFailure?: TransitionKeyword;
  provider?: ProviderRef;
  model?: string;
  reasoning?: PipelinePhase["reasoning"];
  timeout?: string;
};

export function validatePipelineArray(
  value: unknown,
  path: string,
  errors: string[],
): readonly PipelinePhase[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array of phase objects`);
    return undefined;
  }
  if (value.length === 0) {
    errors.push(`${path}: must contain at least one phase`);
    return undefined;
  }

  const phases: PipelinePhase[] = [];
  value.forEach((raw, i) => {
    const phase = validatePhase(raw, `${path}[${i}]`, errors);
    if (phase) phases.push(phase);
  });
  return phases;
}

function validatePhase(
  raw: unknown,
  path: string,
  errors: string[],
): PipelinePhase | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${path}: expected a mapping`);
    return undefined;
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.agent !== "string" || obj.agent.length === 0) {
    errors.push(`${path}.agent: required, must be a non-empty string`);
    return undefined;
  }

  const phase: MutablePhase = { agent: obj.agent };

  if (obj.repeat !== undefined) {
    if (typeof obj.repeat !== "number" || !Number.isInteger(obj.repeat) || obj.repeat < 1) {
      errors.push(`${path}.repeat: must be a positive integer`);
    } else {
      phase.repeat = obj.repeat;
    }
  }

  if (obj.onFailure !== undefined) {
    const transition = parseTransition(obj.onFailure, `${path}.onFailure`, errors);
    if (transition) phase.onFailure = transition;
  }

  if (obj.provider !== undefined) {
    const provider = validateProvider(obj.provider, `${path}.provider`, errors);
    if (provider) phase.provider = provider;
  }

  if (obj.model !== undefined) {
    if (typeof obj.model !== "string" || obj.model.length === 0) {
      errors.push(`${path}.model: must be a non-empty string`);
    } else {
      phase.model = obj.model;
    }
  }

  if (obj.reasoning !== undefined) {
    if (typeof obj.reasoning !== "string" || !REASONING_VALUES.has(obj.reasoning)) {
      errors.push(
        `${path}.reasoning: must be one of ${Array.from(REASONING_VALUES).join(", ")}`,
      );
    } else {
      phase.reasoning = obj.reasoning as PipelinePhase["reasoning"];
    }
  }

  if (obj.timeout !== undefined) {
    if (typeof obj.timeout !== "string") {
      errors.push(`${path}.timeout: must be a string like "30m" or "2h"`);
    } else {
      phase.timeout = obj.timeout;
    }
  }

  return phase as PipelinePhase;
}

function parseTransition(
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

function validateProvider(
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
  if (Array.isArray(value)) {
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
  errors.push(`${path}: must be a string or an array of strings`);
  return undefined;
}

export function validateStringArray(
  value: unknown,
  path: string,
  errors: string[],
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array of strings`);
    return undefined;
  }
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== "string" || entry.length === 0) {
      errors.push(`${path}[${i}]: must be a non-empty string`);
      return undefined;
    }
  }
  return value;
}

export function validateStringMap(
  value: unknown,
  path: string,
  errors: string[],
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected a mapping of string → string`);
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`${path}.${k}: must be a non-empty string`);
      return undefined;
    }
    out[k] = v;
  }
  return out;
}
