import { join } from "node:path";
import { JsonlEventStore } from "@aloop/event-jsonl";
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
};

const DEFAULT_PROVIDER_REF = "opencode";

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
        const prompt = readPrompt(sessionDir, step.ref);
        const adapter = input.providerRegistry.resolve(DEFAULT_PROVIDER_REF).adapter;
        let sequence = 0;
        let turnFailed = false;

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
          }
        } finally {
          await input.scheduler.releasePermit(permitDecision.permit.id);
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
      const running = runInternal(sessionId).finally(() => { inFlightRuns.delete(sessionId); });
      inFlightRuns.set(sessionId, running);
      return running;
    },
  };
}
