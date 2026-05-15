import type { Database } from "bun:sqlite";
import type { EventWriter } from "../events/append-and-project.ts";
import {
  type Artifact,
  type ArtifactFilter,
  type ArtifactKind,
  type CreateArtifactInput,
  ArtifactNotFoundError,
} from "./artifacts-types.ts";

export {
  type Artifact,
  type ArtifactFilter,
  type ArtifactKind,
  type CreateArtifactInput,
  ArtifactNotFoundError,
};

export class ArtifactRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateArtifactInput): Artifact {
    const id = input.id ?? `a_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = input.now ?? new Date().toISOString();
    const incubationJson = input.incubation != null ? JSON.stringify(input.incubation) : null;

    this.db.run(
      `INSERT INTO artifacts (id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at, composer_turn_id, control_subagent_run_id, incubation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.project_id,
        input.session_id ?? null,
        input.setup_run_id ?? null,
        input.work_item_key ?? null,
        input.kind,
        input.phase ?? null,
        input.label ?? null,
        input.filename,
        input.media_type,
        input.bytes,
        now,
        input.composer_turn_id ?? null,
        input.control_subagent_run_id ?? null,
        incubationJson,
      ],
    );

    return this.getRequired(id);
  }

  get(id: string): Artifact | undefined {
    const row = this.db
      .query<{
        id: string;
        project_id: string;
        session_id: string | null;
        setup_run_id: string | null;
        work_item_key: string | null;
        kind: string;
        phase: string | null;
        label: string | null;
        filename: string;
        media_type: string;
        bytes: number;
        created_at: string;
        composer_turn_id: string | null;
        control_subagent_run_id: string | null;
        incubation: string | null;
      }, [string]>(
        `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at, composer_turn_id, control_subagent_run_id, incubation
         FROM artifacts WHERE id = ?`,
      )
      .get(id);

    if (!row) return undefined;
    return toArtifact(row);
  }

  list(filter: ArtifactFilter = {}): Artifact[] {
    type ArtifactRow = {
      id: string;
      project_id: string;
      session_id: string | null;
      setup_run_id: string | null;
      work_item_key: string | null;
      kind: string;
      phase: string | null;
      label: string | null;
      filename: string;
      media_type: string;
      bytes: number;
      created_at: string;
      composer_turn_id: string | null;
      control_subagent_run_id: string | null;
      incubation: string | null;
    };

    // Build a WHERE clause from the filter, supporting multiple filter dimensions.
    const conditions: string[] = [];
    const args: string[] = [];

    if (filter.composer_turn_id !== undefined) {
      conditions.push("composer_turn_id = ?");
      args.push(filter.composer_turn_id);
    }
    if (filter.control_subagent_run_id !== undefined) {
      conditions.push("control_subagent_run_id = ?");
      args.push(filter.control_subagent_run_id);
    }
    if (filter.project_id !== undefined) {
      conditions.push("project_id = ?");
      args.push(filter.project_id);
    }
    if (filter.session_id !== undefined) {
      conditions.push("session_id = ?");
      args.push(filter.session_id);
    }
    if (filter.setup_run_id !== undefined) {
      conditions.push("setup_run_id = ?");
      args.push(filter.setup_run_id);
    }
    if (filter.work_item_key !== undefined) {
      conditions.push("work_item_key = ?");
      args.push(filter.work_item_key);
    }
    if (filter.phase !== undefined) {
      conditions.push("phase = ?");
      args.push(filter.phase);
    }
    if (filter.type !== undefined) {
      conditions.push("kind = ?");
      args.push(filter.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at, composer_turn_id, control_subagent_run_id, incubation
 FROM artifacts ${where} ORDER BY created_at DESC`;

    return this.db
      .query<ArtifactRow, string[]>(query)
      .all(...args)
      .map(toArtifact);
  }

  delete(id: string): void {
    const changes = this.db.run(`DELETE FROM artifacts WHERE id = ?`, [id]);
    if (changes.changes === 0) throw new ArtifactNotFoundError(id);
  }

  private getRequired(id: string): Artifact {
    const a = this.get(id);
    if (!a) throw new ArtifactNotFoundError(id);
    return a;
  }
}

export function emitArtifactChanged(
  events: EventWriter | undefined,
  artifact: Artifact,
  change_kind: "created" | "updated" | "deleted",
): void {
  if (!events) return;
  void events.append("artifact.changed", {
    artifact_id: artifact.id,
    project_id: artifact.project_id,
    session_id: artifact.session_id,
    composer_turn_id: artifact.composer_turn_id,
    control_subagent_run_id: artifact.control_subagent_run_id,
    kind: artifact.kind,
    phase: artifact.phase,
    label: artifact.label,
    change_kind,
    updated_at: artifact.created_at,
  });
}

function toArtifact(row: {
  id: string;
  project_id: string;
  session_id: string | null;
  setup_run_id: string | null;
  work_item_key: string | null;
  kind: string;
  phase: string | null;
  label: string | null;
  filename: string;
  media_type: string;
  bytes: number;
  created_at: string;
  composer_turn_id: string | null;
  control_subagent_run_id: string | null;
  incubation: string | null;
}): Artifact {
  return {
    _v: 1,
    id: row.id,
    project_id: row.project_id,
    session_id: row.session_id,
    setup_run_id: row.setup_run_id,
    work_item_key: row.work_item_key,
    kind: row.kind as ArtifactKind,
    phase: row.phase,
    label: row.label,
    filename: row.filename,
    media_type: row.media_type,
    bytes: row.bytes,
    url: `/v1/artifacts/${row.id}/content`,
    created_at: row.created_at,
    composer_turn_id: row.composer_turn_id,
    control_subagent_run_id: row.control_subagent_run_id,
    incubation: row.incubation != null ? JSON.parse(row.incubation) : null,
  };
}
