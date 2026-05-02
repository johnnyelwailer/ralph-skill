import type { AgentPhase, ContextId, ExecPhase, PipelinePhase, TransitionKeyword } from "./types";
import {
  parseTransition,
  validateProvider,
  validateReasoning,
} from "./pipeline-phase-validators.ts";

type MutableAgentPhase = {
  agent: string;
  repeat?: number;
  onFailure?: TransitionKeyword;
  provider?: AgentPhase["provider"];
  model?: string;
  reasoning?: AgentPhase["reasoning"];
  timeout?: string;
  context?: readonly ContextId[];
};

type MutableExecPhase = {
  exec: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  cwd?: string;
  timeout?: string;
  onFailure?: TransitionKeyword;
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

  const hasAgent = typeof obj.agent === "string" && obj.agent.length > 0;
  const hasExec = typeof obj.exec === "string" && obj.exec.length > 0;

  if (!hasAgent && !hasExec) {
    errors.push(
      `${path}: phase must have either an 'agent' or 'exec' key (non-empty string)`,
    );
    return undefined;
  }

  if (hasAgent && hasExec) {
    errors.push(
      `${path}: phase cannot have both 'agent' and 'exec' keys; they are mutually exclusive`,
    );
    return undefined;
  }

  if (hasExec) {
    return validateExecPhase(obj, path, errors);
  }

  return validateAgentPhase(obj, path, errors);
}

function validateAgentPhase(
  obj: Record<string, unknown>,
  path: string,
  errors: string[],
): AgentPhase | undefined {
  const phase: MutableAgentPhase = { agent: obj.agent as string };

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

  if (obj.context !== undefined) {
    const validated = validateContext(obj.context, `${path}.context`, errors);
    if (validated) phase.context = validated;
  }

  return phase as AgentPhase;
}

function validateExecPhase(
  obj: Record<string, unknown>,
  path: string,
  errors: string[],
): ExecPhase | undefined {
  const phase: MutableExecPhase = { exec: obj.exec as string };

  if (obj.args !== undefined) {
    if (!Array.isArray(obj.args)) {
      errors.push(`${path}.args: must be an array of strings`);
    } else {
      const args: string[] = [];
      for (let i = 0; i < obj.args.length; i++) {
        if (typeof obj.args[i] !== "string") {
          errors.push(`${path}.args[${i}]: must be a string`);
        } else {
          args.push(obj.args[i] as string);
        }
      }
      phase.args = args;
    }
  }

  if (obj.env !== undefined) {
    if (typeof obj.env !== "object" || obj.env === null || Array.isArray(obj.env)) {
      errors.push(`${path}.env: must be a mapping of string → string`);
    } else {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj.env)) {
        if (typeof v !== "string" || v.length === 0) {
          errors.push(`${path}.env.${k}: must be a non-empty string`);
        } else {
          env[k] = v;
        }
      }
      phase.env = env;
    }
  }

  if (obj.cwd !== undefined) {
    if (typeof obj.cwd !== "string") {
      errors.push(`${path}.cwd: must be a string`);
    } else {
      phase.cwd = obj.cwd;
    }
  }

  if (obj.timeout !== undefined) {
    if (typeof obj.timeout !== "string") {
      errors.push(`${path}.timeout: must be a string like "30m" or "2h"`);
    } else {
      phase.timeout = obj.timeout;
    }
  }

  if (obj.onFailure !== undefined) {
    const transition = parseTransition(obj.onFailure, `${path}.onFailure`, errors);
    if (transition) phase.onFailure = transition;
  }

  return phase as ExecPhase;
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

/**
 * Validate a context field value from pipeline.yml.
 * Accepts:
 *   - string: shorthand for a context id
 *   - object with id: string and optional budgetTokens: number
 *   - array of either form
 */
export function validateContext(
  value: unknown,
  path: string,
  errors: string[],
): readonly ContextId[] | undefined {
  if (value === undefined) return undefined;

  // Single string shorthand
  if (typeof value === "string") {
    if (value.length === 0) {
      errors.push(`${path}: context id must be a non-empty string`);
      return undefined;
    }
    return [{ id: value }];
  }

  // Array of context ids
  if (Array.isArray(value)) {
    if (value.length === 0) {
      errors.push(`${path}: context array must not be empty`);
      return undefined;
    }
    const result: ContextId[] = [];
    let hadError = false;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === "string") {
        if (item.length === 0) {
          errors.push(`${path}[${i}]: context id must be a non-empty string`);
          hadError = true;
          continue;
        }
        result.push({ id: item });
      } else if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.id !== "string" || obj.id.length === 0) {
          errors.push(`${path}[${i}].id: must be a non-empty string`);
          hadError = true;
          continue;
        }
        if (obj.budgetTokens !== undefined) {
          if (
            typeof obj.budgetTokens !== "number" ||
            !Number.isInteger(obj.budgetTokens) ||
            obj.budgetTokens <= 0
          ) {
            errors.push(`${path}[${i}].budgetTokens: must be a positive integer`);
            hadError = true;
            // budgetTokens invalid — push id without it
            result.push({ id: obj.id });
            continue;
          }
          result.push({ id: obj.id, budgetTokens: obj.budgetTokens });
        } else {
          result.push({ id: obj.id });
        }
      } else {
        errors.push(`${path}[${i}]: must be a string or a context object with id`);
        hadError = true;
        continue;
      }
    }
    // Reject the whole context field if any item had errors, but still collect all errors.
    if (hadError) return undefined;
    return result;
  }

  // Object form — single context with optional budgetTokens
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.length === 0) {
      errors.push(`${path}.id: must be a non-empty string`);
      return undefined;
    }
    if (obj.budgetTokens !== undefined) {
      if (
        typeof obj.budgetTokens !== "number" ||
        !Number.isInteger(obj.budgetTokens) ||
        obj.budgetTokens <= 0
      ) {
        errors.push(`${path}.budgetTokens: must be a positive integer`);
        return undefined;
      }
      return [{ id: obj.id, budgetTokens: obj.budgetTokens }];
    }
    return [{ id: obj.id }];
  }

  errors.push(`${path}: must be a context id string, an object with id, or an array of these`);
  return undefined;
}

