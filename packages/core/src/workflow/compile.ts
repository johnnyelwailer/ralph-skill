/**
 * Compile step — workflow YAML → workflow-plan.json
 *
 * The compile step is the ONLY place where workflow YAML gets interpreted.
 * Spec: docs/spec/pipeline.md §Compile step
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYAML } from "yaml";
import type {
  CompileOptions,
  CompileResult,
  CompiledAgentStep,
  CompiledExecStep,
  CompiledHandlerPlan,
  CompiledStep,
  RawHandlerDef,
  RawStepDef,
  RawWorkflowYAML,
  TransitionRule,
  WorkflowPlan,
} from "./types.ts";

const HANDLER_NAMES = [
  "start",
  "steer",
  "stuck_detected",
  "merge_conflict",
  "child_stuck",
  "burn_rate_alert",
  "pr_review_needed",
  "merge_conflict_pr",
  "user_comment",
  "decompose_needed",
  "refine_needed",
  "estimate_needed",
  "orch_diagnose",
  "dependency_signal",
  "coverage_signal",
  "docs_signal",
  "demo_signal",
  "refactor_signal",
  "bug_signal",
  "maintenance_sweep_requested",
] as const;

export function compileWorkflow(
  workflowYaml: RawWorkflowYAML,
  workflowName: string,
  opts: CompileOptions,
): CompileResult {
  const errors: string[] = [];

  if (!workflowYaml || typeof workflowYaml !== "object") {
    return { ok: false, errors: ["workflow YAML must be an object"] };
  }

  const handlers: Record<string, CompiledHandlerPlan> = {};
  const rawHandlers = extractHandlers(workflowYaml);

  for (const name of Object.keys(rawHandlers)) {
    if (!HANDLER_NAMES.includes(name as (typeof HANDLER_NAMES)[number])) {
      errors.push(`unknown handler name "${name}" — valid names: ${HANDLER_NAMES.join(", ")}`);
    }
  }

  for (const [name, rawHandler] of Object.entries(rawHandlers)) {
    const compileResult = compileHandler(name, rawHandler, opts);
    if (!compileResult.ok) {
      for (const e of compileResult.errors) errors.push(`handler "${name}": ${e}`);
    } else {
      handlers[name] = compileResult.plan;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const plan: WorkflowPlan = {
    _v: 1,
    workflow: workflowName,
    version: 1,
    handlers,
  };

  return { ok: true, plan };
}

function extractHandlers(yaml: RawWorkflowYAML): Readonly<Record<string, RawHandlerDef>> {
  if (yaml && typeof yaml === "object" && "on" in yaml && yaml.on && typeof yaml.on === "object") {
    return yaml.on as Readonly<Record<string, RawHandlerDef>>;
  }
  if (yaml && typeof yaml === "object" && "pipeline" in yaml) {
    return { start: { pipeline: (yaml as unknown as RawHandlerDef).pipeline as RawHandlerDef["pipeline"], finalizer: (yaml as unknown as RawHandlerDef).finalizer } };
  }
  return {};
}

function compileHandler(
  name: string,
  handler: RawHandlerDef,
  _opts: CompileOptions,
): { ok: true; plan: CompiledHandlerPlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!handler || typeof handler !== "object") {
    return { ok: false, errors: ["handler must be an object"] };
  }

  if (!Array.isArray(handler.pipeline)) {
    errors.push("pipeline must be an array");
  }

  const pipelineSteps: CompiledStep[] = [];
  const transitions: Record<string, TransitionRule> = {};

  for (let i = 0; i < (handler.pipeline ?? []).length; i++) {
    const step = handler.pipeline[i]!;
    const stepResult = compileStep(step, i, name, handler.pipeline!, transitions, false);
    if (!stepResult.ok) {
      for (const e of stepResult.errors) errors.push(`pipeline[${i}]: ${e}`);
    } else {
      const expandedStart = pipelineSteps.length;
      pipelineSteps.push(...stepResult.steps);
      const expandedEnd = pipelineSteps.length - 1;
      if (stepResult.retryIndex !== undefined) {
        transitions[String(stepResult.retryIndex)] = { type: "retry" };
      }
      if (stepResult.gotoTarget !== undefined) {
        transitions[String(stepResult.gotoTarget)] = { type: "goto", target: String(stepResult.targetExpandedIndex) };
      }
    }
  }

  const finalizerSteps: CompiledStep[] = [];
  for (let i = 0; i < (handler.finalizer ?? []).length; i++) {
    const step = handler.finalizer[i]!;
    const stepResult = compileStep(step, i, name, handler.finalizer!, transitions, true);
    if (!stepResult.ok) {
      for (const e of stepResult.errors) errors.push(`finalizer[${i}]: ${e}`);
    } else {
      finalizerSteps.push(...stepResult.steps);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const plan: CompiledHandlerPlan = {
    cycle: name === "start" && Boolean(handler.cycle),
    pipeline: pipelineSteps,
    ...(finalizerSteps.length > 0 && { finalizer: finalizerSteps }),
    transitions,
  };

  return { ok: true, plan };
}

type StepCompileResult =
  | { ok: true; steps: CompiledStep[]; retryIndex?: number; gotoTarget?: number; targetExpandedIndex?: number }
  | { ok: false; errors: string[] };

function compileStep(
  step: RawStepDef,
  index: number,
  _handlerName: string,
  handlerPipeline: readonly RawStepDef[],
  _existingTransitions: Record<string, TransitionRule>,
  isFinalizer = false,
): StepCompileResult {
  if (!step || typeof step !== "object") {
    return { ok: false, errors: ["step must be an object"] };
  }

  if ("agent" in step) {
    const agentName = step.agent;
    if (typeof agentName !== "string" || !agentName) {
      return { ok: false, errors: ["agent name must be a non-empty string"] };
    }
    const steps: CompiledAgentStep[] = [];
    const repeat = typeof step.repeat === "number" && step.repeat > 1 ? step.repeat : 1;
    for (let i = 0; i < repeat; i++) {
      steps.push({ kind: "agent" as const, ref: `PROMPT_${agentName}.md` });
    }

    if (step.onFailure === "retry" && !isFinalizer) {
      if (repeat > 1) {
        return { ok: false, errors: ['onFailure: "retry" cannot be used with repeat > 1'] };
      }
      return { ok: true, steps, retryIndex: index };
    }
    if (typeof step.onFailure === "string" && step.onFailure !== "retry") {
      const gotoTarget = step.onFailure.replace(/^goto\s+/, "");
      const afterIndex = handlerPipeline.findIndex(
        (_s, idx) => idx > index && "agent" in _s && _s.agent === gotoTarget,
      );
      if (afterIndex < 0) {
        return { ok: false, errors: [`onFailure goto target "${gotoTarget}" not found in pipeline after current step`] };
      }
      return { ok: true, steps, gotoTarget: index, targetExpandedIndex: afterIndex };
    }
    return { ok: true, steps };
  }

  if ("exec" in step) {
    const execName = step.exec;
    if (typeof execName !== "string" || !execName) {
      return { ok: false, errors: ["exec name must be a non-empty string"] };
    }
    const repeat = typeof step.repeat === "number" && step.repeat > 1 ? step.repeat : 1;
    const steps: CompiledExecStep[] = [];
    for (let i = 0; i < repeat; i++) {
      steps.push({ kind: "exec" as const, ref: `EXEC_${execName}.yml` });
    }
    return { ok: true, steps };
  }

  return { ok: false, errors: ["step must have either 'agent' or 'exec' property"] };
}

export type LoadWorkflowOptions = {
  readonly workflowsDir: string;
  readonly projectRoot?: string;
};

export function loadWorkflowFile(
  workflowName: string,
  opts: LoadWorkflowOptions,
): { ok: true; source: string; raw: RawWorkflowYAML } | { ok: false; errors: string[] } {
  const { workflowsDir } = opts;
  const filePath = join(workflowsDir, `${workflowName}.yaml`);
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, errors: [`workflow file not found: ${filePath}`] };
    }
    return { ok: false, errors: [`cannot read workflow file: ${(err as Error).message}`] };
  }

  let raw: RawWorkflowYAML;
  try {
    raw = parseYAML(source) as RawWorkflowYAML;
  } catch (err) {
    return { ok: false, errors: [`yaml parse error: ${(err as Error).message}`] };
  }

  return { ok: true, source, raw };
}

export function compileWorkflowFromFile(
  workflowName: string,
  opts: CompileOptions & LoadWorkflowOptions,
): CompileResult {
  const loaded = loadWorkflowFile(workflowName, opts);
  if (!loaded.ok) {
    return { ok: false, errors: loaded.errors };
  }
  return compileWorkflow(loaded.raw, workflowName, opts);
}
