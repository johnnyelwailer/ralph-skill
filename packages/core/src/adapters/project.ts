import type { Project } from "@aloop/state-projects";

export type ProjectAdapterTarget = "local-fs" | "remote-clone";

export interface ProjectAdapter {
  readonly id: string;
  readonly target: ProjectAdapterTarget;
  resolveProjectRoot(projectId: string): Promise<string>;
  resolveWorktreeRoot(sessionId: string): Promise<string | null>;
  createWorktree(sessionId: string, projectId: string): Promise<string>;
  destroyWorktree(sessionId: string): Promise<void>;
  getProjectFromPath(absPath: string): Project | undefined;
  listProjects(): Project[];
}