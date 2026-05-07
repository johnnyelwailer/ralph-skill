import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionStatus } from "@aloop/core";
import type { SchedulerService } from "@aloop/scheduler";
import type { HealthCounters } from "./health.ts";

export function buildCounters(sessionsDir: string, scheduler: SchedulerService): HealthCounters {
  const sessionsByStatus: Record<string, number> = {};
  let sessionsTotal = 0;

  if (existsSync(sessionsDir)) {
    let topLevel: string[];
    try { topLevel = readdirSync(sessionsDir); } catch { topLevel = []; }

    for (const projectId of topLevel) {
      let sessionIds: string[];
      try { sessionIds = readdirSync(join(sessionsDir, projectId)); } catch { continue; }

      for (const sessionId of sessionIds) {
        const sessionPath = join(sessionsDir, projectId, sessionId, "session.json");
        let status: SessionStatus | undefined;
        try {
          const parsed = JSON.parse(readFileSync(sessionPath, "utf-8")) as { status?: SessionStatus };
          status = parsed?.status;
        } catch { continue; }
        sessionsTotal++;
        const s = status ?? "unknown";
        sessionsByStatus[s] = (sessionsByStatus[s] ?? 0) + 1;
      }
    }
  }

  return { sessionsTotal, sessionsByStatus, permitsInFlight: scheduler.listPermits().length };
}
