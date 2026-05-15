import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { Project } from "../project-types.ts";
import type { ProjectAdapter, ProjectAdapterTarget } from "@aloop/core";
import {
  getProjectById,
  getProjectByPath,
  listProjectsFromDb,
  type CreateProjectInput,
} from "..";

export type LocalFsProjectAdapterOptions = {
  readonly db: Database;
  readonly stateDir: string;
};

export function createLocalFsProjectAdapter(options: LocalFsProjectAdapterOptions): ProjectAdapter {
  return new LocalFsProjectAdapterImpl(options);
}

class LocalFsProjectAdapterImpl implements ProjectAdapter {
  readonly id = "local-fs";
  readonly target: ProjectAdapterTarget = "local-fs";

  constructor(private readonly options: LocalFsProjectAdapterOptions) {}

  async resolveProjectRoot(projectId: string): Promise<string> {
    const project = getProjectById(this.options.db, projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    return project.absPath;
  }

  async resolveWorktreeRoot(sessionId: string): Promise<string | null> {
    const worktreePath = join(this.options.stateDir, "sessions", sessionId, "worktree");
    if (existsSync(worktreePath)) return worktreePath;
    return null;
  }

  async createWorktree(sessionId: string, projectId: string): Promise<string> {
    const project = getProjectById(this.options.db, projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    const worktreePath = join(this.options.stateDir, "sessions", sessionId, "worktree");
    return worktreePath;
  }

  async destroyWorktree(_sessionId: string): Promise<void> {
    // worktree cleanup is handled by session archival, not here
  }

  getProjectFromPath(absPath: string): Project | undefined {
    return getProjectByPath(this.options.db, absPath);
  }

  listProjects(): Project[] {
    return listProjectsFromDb(this.options.db, {});
  }
}