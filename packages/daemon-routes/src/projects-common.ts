import type { Project, ProjectRegistry, ProjectStatus } from "@aloop/state-sqlite";

export const VALID_STATUSES: ReadonlyArray<ProjectStatus> = [
  "setup_pending",
  "ready",
  "archived",
];

export type Deps = { readonly registry: ProjectRegistry };

export function projectResponse(p: Project): Record<string, unknown> {
  return {
    _v: 1,
    id: p.id,
    abs_path: p.absPath,
    name: p.name,
    status: p.status,
    added_at: p.addedAt,
    last_active_at: p.lastActiveAt,
    updated_at: p.updatedAt,
  };
}
