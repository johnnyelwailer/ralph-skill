import type { PipelinePhase } from "./types.ts";
import {
  parseTransition,
  validateProvider,
  validateReasoning,
} from "./pipeline-phase-validators.ts";

type MutablePhase = {
  agent: string;
  repeat?: number;
  onFailure?: PipelinePhase["onFailure"];
  provider?: PipelinePhase["provider"];
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
    const reasoning = validateReasoning(obj.reasoning, `${path}.reasoning`, errors);
    if (reasoning) phase.reasoning = reasoning;
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
