import { readFileSync } from "node:fs";
import { parse as parseYaml, YAMLParseError } from "yaml";
import type {
  LoopPlan,
  ParseResult,
  PipelineConfig,
  PipelinePhase,
  StepDescriptor,
  TransitionKeyword,
} from "./types.ts";
import {
  validatePipelineArray,
  validateStringMap,
} from "./pipeline-validators.ts";

const TOP_LEVEL_KEYS = ["pipeline", "finalizer", "triggers"] as const;

/**
 * Parse a pipeline.yml file into a PipelineConfig. Returns typed errors for
 * schema violations with path-qualified messages. Never throws for
 * user-authored content — only for non-ENOENT I/O errors.
 */
export function parsePipeline(source: string): ParseResult<PipelineConfig> {
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (err) {
    if (err instanceof YAMLParseError) {
      return fail([`yaml parse error: ${err.message}`]);
    }
    throw err;
  }

  if (parsed === null || parsed === undefined) {
    return fail(["pipeline.yml is empty or null"]);
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(["pipeline.yml must be a YAML mapping at the top level"]);
  }

  const errors: string[] = [];
  const root = parsed as Record<string, unknown>;

  const pipeline = validatePipelineArray(root.pipeline, "pipeline", errors);
  const finalizer = validatePipelineArray(root.finalizer, "finalizer", errors);
  const triggers = validateStringMap(root.triggers, "triggers", errors);

  for (const key of Object.keys(root)) {
    if (!TOP_LEVEL_KEYS.includes(key as (typeof TOP_LEVEL_KEYS)[number])) {
      errors.push(`unknown top-level field: ${key}`);
    }
  }

  if (errors.length > 0) return fail(errors);
  if (!pipeline) return fail(["pipeline field is required"]);

  return {
    ok: true,
    value: {
      pipeline,
      ...(finalizer !== undefined && { finalizer }),
      ...(triggers !== undefined && { triggers }),
    },
  };
}

export function loadPipelineFromFile(path: string): ParseResult<PipelineConfig> {
  let source: string;
  try {
    source = readFileSync(path, "utf-8");
  } catch (err) {
    return fail([`cannot read pipeline file: ${path}: ${(err as Error).message}`]);
  }
  return parsePipeline(source);
}

/**
 * Compile a PipelineConfig into a LoopPlan. The compile step is the only
 * place YAML semantics (like `repeat: 5`) are interpreted; the runtime only
 * reads the flat cycle array from the resulting LoopPlan.
 */
export function compilePipeline(config: PipelineConfig): LoopPlan {
  const cycle: StepDescriptor[] = [];
  const transitions: Record<string, TransitionKeyword> = {};

  for (const phase of config.pipeline) {
    appendPhase(phase, cycle, transitions);
  }

  const finalizer: StepDescriptor[] = [];
  for (const phase of config.finalizer ?? []) {
    // Finalizer phases use the same PROMPT convention as cycle phases.
    // Explicit prompt filenames are not supported in finalizer (unlike cycle),
    // matching the SPEC convention-over-configuration approach.
    if ("exec" in phase) {
      finalizer.push({ kind: "exec", ref: `EXEC_${phase.exec}.json` });
    } else {
      finalizer.push({ kind: "agent", ref: `PROMPT_${phase.agent}.md` });
    }
  }

  return {
    _v: 1,
    cycle,
    finalizer,
    triggers: config.triggers ?? {},
    cyclePosition: 0,
    finalizerPosition: 0,
    iteration: 1,
    allTasksMarkedDone: false,
    version: 1,
    transitions,
  };
}

function appendPhase(
  phase: PipelinePhase,
  cycle: StepDescriptor[],
  transitions: Record<string, TransitionKeyword>,
): void {
  if ("exec" in phase) {
    // Exec phases produce a single step descriptor with kind=exec
    cycle.push({ kind: "exec", ref: `EXEC_${phase.exec}.json` });
    return;
  }
  // Agent phases may repeat
  const copies = phase.repeat ?? 1;
  for (let i = 0; i < copies; i++) {
    const cyclePosition = cycle.length;
    cycle.push({ kind: "agent", ref: `PROMPT_${phase.agent}.md` });
    if (phase.onFailure) {
      transitions[String(cyclePosition)] = phase.onFailure;
    }
  }
}

/**
 * Convention-over-configuration: an agent named `build` compiles to
 * `PROMPT_build.md`. Pipeline authors can override by explicitly specifying
 * the prompt filename in finalizer[]; the cycle uses this convention.
 */
function promptForAgent(agent: string): string {
  return `PROMPT_${agent}.md`;
}

function fail<T>(errors: readonly string[]): ParseResult<T> {
  return { ok: false, errors };
}
