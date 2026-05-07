import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compilePipeline, loadPipelineFromFile, type LoopPlan, type SessionKind, type SessionStatus } from "@aloop/core";
import { JsonlEventStore } from "@aloop/event-jsonl";
import type { EventWriter } from "@aloop/state-sqlite";

export type SessionSummary = {
  readonly id: string;
  readonly project_id: string;
  readonly kind: SessionKind;
  readonly status: SessionStatus;
  readonly workflow: string | null;
  readonly created_at: string;
  readonly issue?: number | null;
  readonly parent_session_id?: string | null;
  readonly max_iterations?: number | null;
  readonly notes?: string | null;
};

const TEMPLATES_DIR = resolve(import.meta.dir, "../../../../aloop/templates");
const WORKFLOWS_DIR = resolve(import.meta.dir, "../../../../aloop/workflows");

export function compileSessionPlan(projectPath: string, sessionDir: string, workflow: string | null): LoopPlan {
  const pipelinePath = workflow
    ? join(WORKFLOWS_DIR, workflow.endsWith(".yaml") ? workflow : `${workflow}.yaml`)
    : join(projectPath, "aloop", "pipeline.yml");
  const parsed = loadPipelineFromFile(pipelinePath);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  const plan = compilePipeline(parsed.value);
  mkdirSync(join(sessionDir, "prompts"), { recursive: true });
  for (const step of [...plan.cycle, ...plan.finalizer]) {
    if (step.kind !== "agent") continue;
    const templatePath = join(TEMPLATES_DIR, step.ref);
    if (!existsSync(templatePath)) throw new Error(`prompt template not found: ${step.ref}`);
    writeFileSync(join(sessionDir, "prompts", step.ref), readFileSync(templatePath, "utf-8"), "utf-8");
  }
  writeLoopPlan(sessionDir, plan);
  return plan;
}

export function writeLoopPlan(sessionDir: string, plan: LoopPlan): void {
  writeFileSync(join(sessionDir, "loop-plan.json"), JSON.stringify(plan, null, 2), "utf-8");
}

export function readPrompt(sessionDir: string, ref: string): string {
  return readFileSync(join(sessionDir, "prompts", ref), "utf-8");
}

export function loadSessionSummary(sessionDir: string): SessionSummary | null {
  const path = join(sessionDir, "session.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SessionSummary;
  } catch {
    return null;
  }
}

export function updateSessionStatus(sessionDir: string, session: SessionSummary, status: SessionStatus): SessionSummary {
  const next: SessionSummary = { ...session, status };
  writeFileSync(join(sessionDir, "session.json"), JSON.stringify(next), "utf-8");
  return next;
}

export async function appendSessionScopedEvent(
  events: EventWriter,
  sessionLog: JsonlEventStore,
  topic: string,
  data: Record<string, unknown>,
): Promise<void> {
  const envelope = await events.append(topic, data);
  await sessionLog.append(envelope);
}
