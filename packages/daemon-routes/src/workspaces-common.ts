import type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceFilter,
  WorkspaceRegistry,
  WorkspaceWithCounts,
} from "@aloop/state-sqlite";

export type Deps = { readonly registry: WorkspaceRegistry };

export const VALID_ROLES = [
  "primary",
  "supporting",
  "dependency",
  "experiment",
] as const;

export type Role = (typeof VALID_ROLES)[number];

export function workspaceResponse(w: WorkspaceWithCounts): Record<string, unknown> {
  return {
    _v: 1,
    id: w.id,
    name: w.name,
    description: w.description,
    default_budget_usd_per_day: w.defaultBudgetUsdPerDay,
    metadata: w.metadata,
    default_project_id: w.defaultProjectId,
    project_counts: {
      total: w.projectCounts.total,
      primary: w.projectCounts.primary,
      supporting: w.projectCounts.supporting,
      dependency: w.projectCounts.dependency,
      experiment: w.projectCounts.experiment,
    },
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  };
}

export function parseWorkspaceFilter(url: URL): WorkspaceFilter {
  const q = url.searchParams.get("q") ?? undefined;
  const limit = url.searchParams.has("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  return { q, limit, cursor };
}
