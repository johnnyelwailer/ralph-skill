import type { Database } from "bun:sqlite";
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

    this.db.run(
      `INSERT INTO artifacts (id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      }, [string]>(
        `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
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
    };

    if (filter.project_id !== undefined && filter.session_id !== undefined) {
      return this.db
        .query<ArtifactRow, [string, string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE project_id = ? AND session_id = ? ORDER BY created_at DESC`,
        )
        .all(filter.project_id, filter.session_id)
        .map(toArtifact);
    }

    if (filter.project_id !== undefined) {
      return this.db
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`,
        )
        .all(filter.project_id)
        .map(toArtifact);
    }

    if (filter.session_id !== undefined) {
      return this.db
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE session_id = ? ORDER BY created_at DESC`,
        )
        .all(filter.session_id)
        .map(toArtifact);
    }

    if (filter.setup_run_id !== undefined) {
      return this.db
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE setup_run_id = ? ORDER BY created_at DESC`,
        )
        .all(filter.setup_run_id)
        .map(toArtifact);
    }

    if (filter.work_item_key !== undefined) {
      return this.db
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE work_item_key = ? ORDER BY created_at DESC`,
        )
        .all(filter.work_item_key)
        .map(toArtifact);
    }

    if (filter.phase !== undefined) {
      return this.db
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE phase = ? ORDER BY created_at DESC`,
        )
        .all(filter.phase)
        .map(toArtifact);
    }

    if (filter.type !== undefined) {
      return this.db
        .query<ArtifactRow, [string]>(
          `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
           FROM artifacts WHERE kind = ? ORDER BY created_at DESC`,
        )
        .all(filter.type)
        .map(toArtifact);
    }

    return this.db
      .query<ArtifactRow, []>(
        `SELECT id, project_id, session_id, setup_run_id, work_item_key, kind, phase, label, filename, media_type, bytes, created_at
         FROM artifacts ORDER BY created_at DESC`,
      )
      .all()
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
  };
}