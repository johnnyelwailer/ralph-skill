import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, ProjectRegistry, ProjectStatus } from "@aloop/state-sqlite";
import type { SessionStatus } from "@aloop/core";

export const VALID_STATUSES: ReadonlyArray<ProjectStatus> = [
  "setup_pending",
  "ready",
  "archived",
];

export type Deps = {
  readonly registry: ProjectRegistry;
  /** Path to the sessions directory (stateDir/sessions), used to count sessions per project. */
  readonly sessionsDir: string;
};

/**
 * Count sessions for a given project by scanning the sessions directory.
 * Uses only synchronous filesystem operations (readFileSync) so it can be called
 * from synchronous projectResponse() which is invoked from listProjects().
 *
 * Session dirs live at `{sessionsDir}/{projectId}/s_{sessionId}/session.json`.
 * Returns a session_counts shape: { total: number, by_status: Record<string, number> }.
 */
export function countProjectSessions(sessionsDir: string, projectId: string): {
  total: number;
  by_status: Record<string, number>;
} {
  const projectSessionsDir = join(sessionsDir, projectId);
  if (!existsSync(projectSessionsDir)) {
    return { total: 0, by_status: {} };
  }

  let entries: string[];
  try {
    entries = readdirSync(projectSessionsDir);
  } catch {
    return { total: 0, by_status: {} };
  }

  const byStatus: Record<string, number> = {};
  let total = 0;

  for (const sessionDir of entries) {
    const sessionPath = join(projectSessionsDir, sessionDir, "session.json");
    let status: SessionStatus | undefined;
    try {
      const raw = readFileSync(sessionPath, "utf-8");
      const parsed = JSON.parse(raw) as { status?: SessionStatus };
      status = parsed?.status;
    } catch {
      // Malformed or missing session.json — skip
      continue;
    }

    total++;
    const s = status ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  return { total, by_status: byStatus };
}

export function projectResponse(p: Project, sessionsDir: string): Record<string, unknown> {
  return {
    _v: 1,
    id: p.id,
    abs_path: p.absPath,
    name: p.name,
    status: p.status,
    added_at: p.addedAt,
    last_active_at: p.lastActiveAt,
    updated_at: p.updatedAt,
    session_counts: countProjectSessions(sessionsDir, p.id),
  };
}
