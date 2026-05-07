import { join } from "node:path";
import { JsonlEventStore } from "@aloop/event-jsonl";
import type {
  ContextBlock,
  ContextInput,
  ContextRegistry,
  ContextId,
  TurnObservation,
} from "@aloop/core";
import type { ProviderRegistry } from "@aloop/provider";
import type { SchedulerService } from "@aloop/scheduler";
import type { EventWriter, ProjectRegistry } from "@aloop/state-sqlite";
import {
  appendSessionScopedEvent,
  compileSessionPlan,
  loadSessionSummary,
  readPrompt,
  updateSessionStatus,
  writeLoopPlan,
} from "./session-runner-io.ts";

export type SessionRunner = {
  run(sessionId: string): Promise<void>;
};

export type CreateSessionRunnerInput = {
  readonly registry: ProjectRegistry;
  readonly scheduler: SchedulerService;
  readonly providerRegistry: ProviderRegistry;
  readonly events: EventWriter;
  readonly sessionsDir: () => string;
  /** Live context plugin registry. Created at daemon startup from project manifests. */
  readonly contextRegistry: ContextRegistry;
  /**
   * Resolve the default token budget for a context id.
   * The daemon config (`daemon.contexts[id].budgetTokens`) is the canonical source.
   */
  readonly resolveContextBudget: (contextId: string) => number;
};

const DEFAULT_PROVIDER_REF = "opencode";

/**
 * Render context blocks into a string appended to the prompt.
 * Blocks are prefixed with a Markdown separator and each block's title so
 * the agent can distinguish injected context from the prompt body.
 */
function renderContextBlocks(blocks: readonly ContextBlock[]): string {
  if (blocks.length === 0) return "";
  const rendered = blocks
    .map(
      (b) =>
        `---\n## ${b.title}\n\n${b.body}${b.sources.length > 0 ? "\n\n_Sources: " + b.sources.map((s) => `[${s.label}](${s.uri ?? ""})`).join(", ") + "_" : ""}`,
    )
    .join("\n\n");
  return `\n\n---\n## Injected Context\n\n${rendered}`;
}

/**
 * Extract context ids and budgets from a StepDescriptor's context field.
 * Normalises the ContextId union (string | { id, budgetTokens? }) into a flat
 * string array while preserving per-id budget overrides.
 */
function extractContextIds(
  step: { readonly context?: readonly ContextId[] },
): { ids: string[]; budgets: Map<string, number>; totalBudget: number } {
  const ids: string[] = [];
  const budgets = new Map<string, number>();
  if (!step.context || step.context.length === 0) {
    return { ids: [], budgets, totalBudget: 0 };
  }
  for (const item of step.context) {
    if (typeof item === "string") {
      ids.push(item);
    } else if (typeof item === "object" && item !== null) {
      const obj = item as { id: unknown; budgetTokens?: unknown };
      if (typeof obj.id === "string" && obj.id.length > 0) {
        ids.push(obj.id);
        if (typeof obj.budgetTokens === "number" && obj.budgetTokens > 0) {
          budgets.set(obj.id, obj.budgetTokens);
        }
      }
    }
  }
  const totalBudget = budgets.size > 0
    ? Array.from(budgets.values()).reduce((a, b) => a + b, 0)
    : 0;
  return { ids, budgets, totalBudget };
}

export function createSessionRunner(input: CreateSessionRunnerInput): SessionRunner {
  const inFlightRuns = new Map<string, Promise<void>>();

  async function runInternal(sessionId: string): Promise<void> {
    const sessionDir = join(input.sessionsDir(), sessionId);
    const session = loadSessionSummary(sessionDir);
    if (!session) throw new Error(`session not found: ${sessionId}`);

    const project = input.registry.get(session.project_id);
    if (!project) throw new Error(`project not found: ${session.project_id}`);

    const sessionLog = new JsonlEventStore(join(sessionDir, "log.jsonl"));
    try {
      const plan = compileSessionPlan(project.absPath, sessionDir, session.workflow);
      await appendSessionScopedEvent(input.events, sessionLog, "session.loop_plan.updated", {
        session_id: session.id, project_id: session.project_id, version: plan.version,
      });

      input.registry.touchActivity(project.id);
      let current = updateSessionStatus(sessionDir, session, "running");
      await appendSessionScopedEvent(input.events, sessionLog, "session.event", {
        session_id: current.id, previous_status: session.status, status: current.status,
        kind: current.kind, workflow: current.workflow, project_id: current.project_id,
      });

      let mutablePlan = plan;
      for (let index = mutablePlan.cyclePosition; index < mutablePlan.cycle.length; index += 1) {
        const step = mutablePlan.cycle[index]!;
        if (step.kind !== "agent") throw new Error(`unsupported step kind in minimal runner: ${step.kind}`);

        const permitDecision = await input.scheduler.acquirePermit({
          sessionId: current.id, projectId: current.project_id, providerCandidate: DEFAULT_PROVIDER_REF,
        });
        if (!permitDecision.granted) throw new Error(`permit denied: ${permitDecision.reason}`);

        const turnId = `t_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        const basePrompt = readPrompt(sessionDir, step.ref);

        // Resolve and inject context blocks
        const { ids: contextIds, budgets, totalBudget } = extractContextIds(step);
        let injectedBlocks: readonly ContextBlock[] = [];
        let contextSuffix = "";

        if (contextIds.length > 0) {
          const contextInput: ContextInput = {
            sessionId: current.id,
            projectId: current.project_id,
            authHandle: `auth_${current.id}`,
            agentRole: step.ref.replace(/^PROMPT_|\.md$/g, ""),
            contextId: contextIds.join(","),
            budgetTokens: totalBudget > 0 ? totalBudget : input.resolveContextBudget(contextIds[0]!),
            worktreeRoot: project.absPath,
          };
          injectedBlocks = await input.contextRegistry.build(contextInput, contextIds);
          contextSuffix = renderContextBlocks(injectedBlocks);

          await appendSessionScopedEvent(input.events, sessionLog, "context.injected", {
            session_id: current.id,
            turn_id: turnId,
            context_ids: contextIds,
            blocks: injectedBlocks,
            token_counts: budgets.size > 0 ? Object.fromEntries(budgets) : undefined,
            total_tokens: 0,
          });
        }

        const prompt = basePrompt + contextSuffix;
        const adapter = input.providerRegistry.resolve(DEFAULT_PROVIDER_REF).adapter;
        let sequence = 0;
        let turnFailed = false;
        let outputText = "";

        try {
          for await (const chunk of adapter.sendTurn({
            sessionId: current.id, authHandle: `auth_${current.id}`, providerRef: DEFAULT_PROVIDER_REF,
            prompt, cwd: project.absPath, ...(step.reasoning !== undefined && { reasoningEffort: step.reasoning }),
          })) {
            const type = chunk.type === "thinking" ? "reasoning" : chunk.type;
            const final = "final" in chunk ? chunk.final : chunk.type === "error";
            await appendSessionScopedEvent(input.events, sessionLog, "agent.chunk", {
              session_id: current.id, turn_id: turnId, sequence, type, content: chunk.content, final,
            });
            sequence += 1;
            if (chunk.type === "error") turnFailed = true;
            if (chunk.type === "text" || chunk.type === "reasoning") {
              outputText += (chunk.content as { delta?: string }).delta ?? "";
            }
          }
        } finally {
          await input.scheduler.releasePermit(permitDecision.permit.id);
        }

        // Forward turn observation to all registered context plugins
        if (contextIds.length > 0) {
          const observation: TurnObservation = {
            sessionId: current.id,
            projectId: current.project_id,
            turnId,
            agentRole: step.ref.replace(/^PROMPT_|\.md$/g, ""),
            contextId: contextIds.join(","),
            outputText,
            completedAt: new Date().toISOString(),
            ok: !turnFailed,
          };
          input.contextRegistry.observe(observation);
        }

        if (turnFailed) throw new Error(`turn failed: ${turnId}`);
        mutablePlan = { ...mutablePlan, cyclePosition: index + 1 };
        writeLoopPlan(sessionDir, mutablePlan);
      }

      current = updateSessionStatus(sessionDir, current, "completed");
      await appendSessionScopedEvent(input.events, sessionLog, "session.event", {
        session_id: current.id, previous_status: "running", status: current.status,
        kind: current.kind, workflow: current.workflow, project_id: current.project_id,
      });
    } catch (error) {
      const current = loadSessionSummary(sessionDir);
      if (current) {
        const failed = updateSessionStatus(sessionDir, current, "failed");
        await appendSessionScopedEvent(input.events, sessionLog, "session.event", {
          session_id: failed.id, previous_status: current.status, status: failed.status,
          kind: failed.kind, workflow: failed.workflow, project_id: failed.project_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      await sessionLog.close();
    }
  }

  return {
    async run(sessionId: string): Promise<void> {
      const existing = inFlightRuns.get(sessionId);
      if (existing) return existing;
      const running = runInternal(sessionId).finally(() => {
        inFlightRuns.delete(sessionId);
      });
      inFlightRuns.set(sessionId, running);
      return running;
    },
  };
}
