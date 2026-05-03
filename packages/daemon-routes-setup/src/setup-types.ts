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

// ─── Discovery lane output types ─────────────────────────────────────────────
// These correspond to the seven parallel discovery lanes defined in setup.md §Phase 1.

/** Repository inventory lane output (setup.md §Phase 1: Repository inventory). */
export type RepoInventoryFinding = {
  readonly fileCount: number;
  readonly moduleBoundaries: string[];
  readonly notableHotspots: string[];
  readonly classifications: Record<string, string[]>;
};

/** Stack detection lane output (setup.md §Phase 1: Stack detection). */
export type StackDetectionFinding = {
  readonly language: string | null;
  readonly framework: string | null;
  readonly testRunner: string | null;
  readonly cssApproach: string | null;
  readonly bundler: string | null;
  readonly runtimeVersions: Record<string, string>;
  readonly configFiles: string[];
};

/** Structure analysis lane output (setup.md §Phase 1: Structure analysis). */
export type StructureAnalysisFinding = {
  readonly projectShape: "library" | "application" | "monorepo" | "greenfield" | "unknown";
  readonly organizationPattern: string;
  readonly moduleSeams: string[];
  readonly maturity: "greenfield" | "early" | "established";
};

/** Pattern analysis lane output (setup.md §Phase 1: Pattern analysis). */
export type PatternAnalysisFinding = {
  readonly namingConventions: string[];
  readonly modulePatterns: string[];
  readonly errorHandlingStyle: string;
  readonly testStyle: string;
  readonly uiLibrary: string | null;
  readonly apiStyle: string | null;
  readonly inconsistencies: string[];
};

/** Build & test baseline lane output (setup.md §Phase 1: Build & test baseline). */
export type BuildBaselineFinding = {
  readonly installCommand: string | null;
  readonly buildCommand: string | null;
  readonly testCommand: string | null;
  readonly lintCommand: string | null;
  readonly installPassed: boolean | null;
  readonly buildPassed: boolean | null;
  readonly testPassed: boolean | null;
  readonly lintPassed: boolean | null;
  readonly installError: string | null;
  readonly buildError: string | null;
  readonly testError: string | null;
  readonly lintError: string | null;
};

/** Intent signals lane output (setup.md §Phase 1: Intent signals). */
export type IntentSignalsFinding = {
  readonly claudeMdPresent: boolean;
  readonly agentsMdPresent: boolean;
  readonly readmeMdPresent: boolean;
  readonly specMdPresent: boolean;
  readonly preExistingAloopState: boolean;
  readonly declaredGoals: string[];
};

/** Environment detection lane output (setup.md §Phase 1: Environment detection). */
export type EnvironmentDetectionFinding = {
  readonly availableProviders: string[];
  readonly usableProviders: string[];
  readonly trackerAdapter: "github" | "builtin" | null;
  readonly devcontainerJsonPresent: boolean;
  readonly ghAuthAvailable: boolean;
  readonly providerAuthDetails: Record<string, "usable" | "needs_config" | "unavailable">;
};

export type SetupFindings = {
  readonly repoInventory?: RepoInventoryFinding;
  readonly stackDetection?: StackDetectionFinding;
  readonly structureAnalysis?: StructureAnalysisFinding;
  readonly patternAnalysis?: PatternAnalysisFinding;
  readonly buildBaseline?: BuildBaselineFinding;
  readonly intentSignals?: IntentSignalsFinding;
  readonly environment?: EnvironmentDetectionFinding;
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
