export type ArtifactKind = "image" | "screenshot" | "mockup" | "diff" | "other";

export type ArtifactFilter = {
  readonly project_id?: string;
  readonly session_id?: string;
  readonly setup_run_id?: string;
  readonly work_item_key?: string;
  readonly phase?: string;
  readonly type?: ArtifactKind;
};

export type Artifact = {
  readonly _v: 1;
  readonly id: string;
  readonly project_id: string;
  readonly session_id: string | null;
  readonly setup_run_id: string | null;
  readonly work_item_key: string | null;
  readonly kind: ArtifactKind;
  readonly phase: string | null;
  readonly label: string | null;
  readonly filename: string;
  readonly media_type: string;
  readonly bytes: number;
  readonly url: string;
  readonly created_at: string;
};

export type CreateArtifactInput = {
  readonly id?: string;
  readonly project_id: string;
  readonly session_id?: string | null;
  readonly setup_run_id?: string | null;
  readonly work_item_key?: string | null;
  readonly kind: ArtifactKind;
  readonly phase?: string | null;
  readonly label?: string | null;
  readonly filename: string;
  readonly media_type: string;
  readonly bytes: number;
  readonly now?: string;
};

export class ArtifactNotFoundError extends Error {
  readonly code = "artifact_not_found" as const;
  constructor(readonly artifactId: string) {
    super(`artifact not found: ${artifactId}`);
    this.name = "ArtifactNotFoundError";
  }
}