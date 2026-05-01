/** Setup run types — daemon-owned setup orchestration state. */

export type SetupRunMode = "standalone" | "orchestrator";
export type SetupRunStatus = "active" | "completed" | "failed" | "abandoned";
export type ReadinessVerdict = "resolved" | "unresolved" | "needs_deeper_research";

/** Core setup run entity persisted to ~/.aloop/state/setup_runs/<id>/run.json */
export type SetupRun = {
  readonly id: string;
  readonly projectId: string | null; // null for greenfield (no project registered yet)
  readonly absPath: string;
  readonly mode: SetupRunMode;
  readonly status: SetupRunStatus;
  readonly phase: SetupPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly verdict: ReadinessVerdict;
  readonly findings: SetupFindings;
  readonly questions: SetupQuestion[];
  readonly chapters: SetupChapter[];
  readonly nonInteractive: boolean;
  readonly flags: Record<string, string>;
};

export type SetupPhase =
  | "discovery"
  | "interview"
  | "ambiguity"
  | "review"
  | "generation"
  | "verification"
  | "handoff"
  | "completed";

export type SetupFindings = {
  readonly repoInventory?: unknown;
  readonly stackDetection?: unknown;
  readonly structureAnalysis?: unknown;
  readonly patternAnalysis?: unknown;
  readonly buildBaseline?: unknown;
  readonly intentSignals?: unknown;
  readonly environment?: unknown;
};

export type SetupQuestion = {
  readonly id: string;
  readonly topic: string;
  readonly text: string;
  readonly answer?: string;
  readonly answeredAt: string | null;
  readonly prerequisites: string[];
  readonly branch: string;
  readonly invalidationConditions: string[];
  readonly followUpEdges: string[];
  readonly options?: SetupQuestionOption[];
};

export type SetupQuestionOption = {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
};

export type SetupChapter = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: "draft" | "approved" | "rejected";
  readonly artifactRefs: string[];
};

export type SetupAnswerInput = {
  readonly question_id: string;
  readonly value: string;
};

export type SetupCommentInput = {
  readonly target_type: "chapter" | "document" | "question";
  readonly target_id: string;
  readonly body: string;
  readonly artifact_refs?: string[];
};

export type CreateSetupRunInput = {
  readonly absPath: string;
  readonly mode?: SetupRunMode;
  readonly nonInteractive?: boolean;
  readonly flags?: Record<string, string>;
};

export class SetupRunNotFoundError extends Error {
  readonly code = "setup_run_not_found";
  constructor(readonly id: string) {
    super(`setup run not found: ${id}`);
  }
}

export class SetupRunNotActiveError extends Error {
  readonly code = "setup_run_not_active";
  constructor(readonly id: string, readonly status: SetupRunStatus) {
    super(`setup run ${id} is not active (status: ${status})`);
  }
}
