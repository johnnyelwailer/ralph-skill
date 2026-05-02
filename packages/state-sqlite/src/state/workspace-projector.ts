import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";
import type { Projector } from "./projector.ts";
import type { WorkspaceProjectRole } from "./workspaces.ts";

type WorkspaceCreatedEvent = {
  workspace_id: string;
  name: string;
  description?: string;
  default_project_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type WorkspaceUpdatedEvent = {
  workspace_id: string;
  name?: string;
  description?: string;
  updated_at: string;
};

type WorkspaceArchivedEvent = {
  workspace_id: string;
  archived_at: string;
};

type WorkspaceProjectAddedEvent = {
  workspace_id: string;
  project_id: string;
  role: WorkspaceProjectRole;
  added_at: string;
};

type WorkspaceProjectRemovedEvent = {
  workspace_id: string;
  project_id: string;
};

function projectWorkspaceCreated(db: Database, data: WorkspaceCreatedEvent): void {
  db.run(
    `INSERT INTO workspaces (id, name, description, default_project_id, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       default_project_id = excluded.default_project_id,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`,
    [
      data.workspace_id,
      data.name,
      data.description ?? "",
      data.default_project_id ?? null,
      JSON.stringify(data.metadata ?? {}),
      data.created_at,
      data.created_at,
    ],
  );
}

function projectWorkspaceUpdated(db: Database, data: WorkspaceUpdatedEvent): void {
  db.run(
    `UPDATE workspaces SET updated_at = ? WHERE id = ?`,
    [data.updated_at, data.workspace_id],
  );
}

function projectWorkspaceArchived(db: Database, data: WorkspaceArchivedEvent): void {
  db.run(
    `UPDATE workspaces SET archived_at = ?, updated_at = ? WHERE id = ?`,
    [data.archived_at, data.archived_at, data.workspace_id],
  );
}

function projectWorkspaceProjectAdded(db: Database, data: WorkspaceProjectAddedEvent): void {
  db.run(
    `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(workspace_id, project_id) DO UPDATE SET role = excluded.role, added_at = excluded.added_at`,
    [data.workspace_id, data.project_id, data.role, data.added_at],
  );
}

function projectWorkspaceProjectRemoved(db: Database, data: WorkspaceProjectRemovedEvent): void {
  db.run(
    `DELETE FROM workspace_projects WHERE workspace_id = ? AND project_id = ?`,
    [data.workspace_id, data.project_id],
  );
}

export class WorkspaceProjector implements Projector {
  readonly name = "workspaces";

  apply(db: Database, event: EventEnvelope): void {
    if (event.topic === "workspace.created") {
      projectWorkspaceCreated(db, event.data as WorkspaceCreatedEvent);
      return;
    }

    if (event.topic === "workspace.updated") {
      projectWorkspaceUpdated(db, event.data as WorkspaceUpdatedEvent);
      return;
    }

    if (event.topic === "workspace.archived") {
      projectWorkspaceArchived(db, event.data as WorkspaceArchivedEvent);
      return;
    }

    if (event.topic === "workspace.project_added") {
      projectWorkspaceProjectAdded(db, event.data as WorkspaceProjectAddedEvent);
      return;
    }

    if (event.topic === "workspace.project_removed") {
      projectWorkspaceProjectRemoved(db, event.data as WorkspaceProjectRemovedEvent);
      return;
    }
  }
}