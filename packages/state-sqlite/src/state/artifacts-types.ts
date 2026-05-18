export type ArtifactKind =
  | "image"
  | "screenshot"
  | "audio"
  | "speech"
  | "video"
  | "document"
  | "transcript"
  | "mockup"
  | "diff"
  | "log"
  | "code"
  | "other";

export type IncubationSource = {
  readonly client: string;
  readonly captured_at: string;
  readonly author?: string;
  readonly url?: string;
};

export type IncubationPromotedRef = {
  readonly target_id: string;
  readonly promoted_at: string;
  readonly evidence_artifact_ids: readonly string[];
};

export type ArtifactIncubation = {
  readonly lifecycle: "captured" | "clarifying" | "researching" | "synthesized" | "ready_for_promotion" | "promoted" | "discarded" | "archived";
  readonly scope: { readonly kind: "global" | "workspace" | "project" | "candidate_project"; readonly project_id?: string; readonly workspace_id?: string; readonly abs_path?: string; readonly repo_url?: string };
  readonly title?: string;
  readonly labels?: readonly string[];
  readonly priority?: "normal" | "high" | "low";
  readonly source?: IncubationSource;
  readonly related_artifact_ids?: readonly string[];
  readonly promoted_refs?: readonly IncubationPromotedRef[];
};

export type ArtifactFilter = {
  readonly project_id?: string;
  readonly session_id?: string;
  readonly setup_run_id?: string;
  readonly work_item_key?: string;
  readonly phase?: string;
  readonly type?: ArtifactKind;
  readonly composer_turn_id?: string;
  readonly control_subagent_run_id?: string;
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
  readonly composer_turn_id: string | null;
  readonly control_subagent_run_id: string | null;
  readonly incubation: ArtifactIncubation | null;
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
  readonly composer_turn_id?: string | null;
  readonly control_subagent_run_id?: string | null;
  readonly incubation?: ArtifactIncubation | null;
};

export class ArtifactNotFoundError extends Error {
  readonly code = "artifact_not_found" as const;
  constructor(readonly artifactId: string) {
    super(`artifact not found: ${artifactId}`);
    this.name = "ArtifactNotFoundError";
  }
}
