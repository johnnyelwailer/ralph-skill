/**
 * Workflow-plan types — compiled representation of a workflow YAML.
 *
 * Spec: docs/spec/pipeline.md §Workflow vs pipeline vs workflow-plan
 */

import type { ExecManifest } from "../runtime-extension/types.ts";

export type WorkflowPlanVersion = 1;

export type CompiledAgentStep = {
  readonly kind: "agent";
  readonly ref: string; // e.g. "PROMPT_plan.md"
};

export type CompiledExecStep = {
  readonly kind: "exec";
  readonly ref: string; // e.g. "EXEC_regen-api.json"
};

export type CompiledStep = CompiledAgentStep | CompiledExecStep;

export type TransitionRule =
  | { readonly type: "retry" }
  | { readonly type: "goto"; readonly target: string };

export type CompiledHandlerPlan = {
  readonly cycle: boolean;
  readonly pipeline: readonly CompiledStep[];
  readonly finalizer?: readonly CompiledStep[];
  readonly transitions: Readonly<Record<string, TransitionRule>>;
};

export type WorkflowPlan = {
  readonly _v: WorkflowPlanVersion;
  readonly workflow: string;
  readonly version: WorkflowPlanVersion;
  readonly handlers: Readonly<Record<string, CompiledHandlerPlan>>;
};

export type CompileOptions = {
  readonly templatesDir: string;
  readonly projectRoot?: string;
  readonly specFiles?: readonly string[];
  readonly referenceFiles?: readonly string[];
  readonly validationCommands?: readonly string[];
  readonly safetyRules?: readonly string[];
  readonly providerHints?: readonly string[];
  readonly constitution?: string;
  readonly subagentHints?: readonly string[];
};

export type CompileResult =
  | { readonly ok: true; readonly plan: WorkflowPlan }
  | { readonly ok: false; readonly errors: readonly string[] };

export type RawWorkflowYAML = {
  readonly pipeline?: readonly RawStepDef[];
  readonly on?: Readonly<Record<string, RawHandlerDef>>;
};

export type RawStepDef =
  | { readonly agent: string; readonly repeat?: number; readonly onFailure?: string }
  | { readonly exec: string; readonly repeat?: number; readonly onFailure?: string };

export type RawHandlerDef = {
  readonly cycle?: boolean;
  readonly pipeline: readonly RawStepDef[];
  readonly finalizer?: readonly RawStepDef[];
};
