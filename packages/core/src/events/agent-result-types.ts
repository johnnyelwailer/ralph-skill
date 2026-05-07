/**
 * Agent result types — fully specified in docs/spec/agents.md and
 * docs/spec/orchestrator.md §Orchestrator prompt outputs.
 *
 * These are the typed schemas for every `aloop-agent submit --type <name>`
 * result that agents emit during a session.  Each type corresponds to the
 * `submit` contract for a named agent role.
 *
 * The result payload flows through `AgentChunkData.content.result` as an
 * arbitrary object.  These types provide static typing for that content.
 *
 * Design decisions left open by the spec are implemented as separate
 * switchable variants gated by a config feature flag
 * (features.{feature-name}.variant: "A" | "B" | "C").
 */

// ─── Shared sub-types ─────────────────────────────────────────────────────────

/** A git commit SHA produced by a build agent. */
export type CommitSha = string & { readonly __brand: "CommitSha" };

/** A relative or absolute file path modified or created by a build. */
export type FilePath = string & { readonly __brand: "FilePath" };

// ─── plan ─────────────────────────────────────────────────────────────────────

/**
 * Result schema for the `plan` agent.
 * Spec: docs/spec/agents.md §`plan` — Completion signal.
 */
export type PlanResult = {
  /** Human-readable summary of what the plan agent decided. */
  readonly summary: string;
  /** Slugs of tasks produced or updated by this run. */
  readonly tasks_updated: readonly string[];
  /** Slugs of tasks that were closed (completed or deleted) by this run. */
  readonly tasks_closed: readonly string[];
};

// ─── build ────────────────────────────────────────────────────────────────────

/**
 * Result schema for the `build` agent.
 * Spec: docs/spec/agents.md §`build` — Completion signal.
 */
export type BuildResult = {
  /** Commit SHAs produced in this turn (one per iteration). */
  readonly commit_shas: readonly CommitSha[];
  /** Files changed in this turn. */
  readonly changed_files: readonly FilePath[];
  /** Whether validation (types, tests, lint) passed. */
  readonly validation_passed: boolean;
  /** Human-readable usage summary (tokens, cost). */
  readonly usage_summary?: {
    readonly tokens_in: number;
    readonly tokens_out: number;
    readonly cost_usd: number;
  };
};

// ─── qa ──────────────────────────────────────────────────────────────────────

/** Outcome of testing a single feature or acceptance criterion. */
export type QaFeatureResult = {
  readonly feature: string;
  readonly status: "pass" | "fail" | "skip";
  readonly notes?: string;
};

/**
 * Result schema for the `qa` agent.
 * Spec: docs/spec/agents.md §`qa` — Completion signal.
 */
export type QaResult = {
  /** Per-feature test outcomes. */
  readonly features: readonly QaFeatureResult[];
  /** Change in coverage since last QA run (percentage points). */
  readonly coverage_delta_pct?: number;
  /** Task IDs of bugs filed in this QA run. */
  readonly bugs_filed: readonly string[];
};

// ─── review ──────────────────────────────────────────────────────────────────

/** One of the nine review gates defined in `instructions/review.md`. */
export type ReviewGateName =
  | "spec_compliance"
  | "test_depth"
  | "coverage"
  | "code_quality"
  | "integration_sanity"
  | "proof_verification"
  | "layout_verification"
  | "version_compliance"
  | "doc_freshness";

/** Outcome of evaluating one gate on one or more files. */
export type ReviewGateResult = {
  readonly gate: ReviewGateName;
  readonly status: "pass" | "fail" | "not_applicable";
  readonly summary: string;
  /** Line numbers (1-indexed) of findings, keyed by file path. */
  readonly findings?: Readonly<Record<FilePath, readonly number[]>>;
};

/**
 * Result schema for the `review` agent.
 * Spec: docs/spec/agents.md §`review` — Submit.
 */
export type ReviewResult = {
  readonly verdict: "approved" | "changes_requested" | "reject";
  /** One entry per gate evaluated. */
  readonly gates: readonly ReviewGateResult[];
  /** Human-readable summary of the overall review. */
  readonly summary: string;
};

// ─── proof ───────────────────────────────────────────────────────────────────

/** A single proof artifact produced by the proof agent. */
export type ProofArtifact = {
  /** Free-form artifact kind; common values: deployment_preview, screenshot,
   * visual_diff, api_response, cli_output, test_summary,
   * accessibility_snapshot, video. */
  readonly type: string;
  /** Path relative to the session artifacts directory (for local artifacts). */
  readonly path?: string;
  /** URL (for external artifacts like deployment previews). */
  readonly url?: string;
  /** Human-readable description of what this artifact demonstrates. */
  readonly description: string;
  /** Optional free-form metadata (viewport, baseline, diff_pct, etc.). */
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/** A task the proof agent decided to skip with a reason. */
export type ProofSkippedTask = {
  readonly task: string;
  readonly reason: string;
};

/**
 * Result schema for the `proof` agent.
 * Spec: docs/spec/agents.md §`proof` — Submit.
 */
export type ProofResult = {
  readonly iteration: number;
  readonly phase: "proof";
  readonly provider: string;
  readonly timestamp: string; // ISO-8601
  readonly summary: string;
  readonly artifacts: readonly ProofArtifact[];
  readonly skipped: readonly ProofSkippedTask[];
  /**
   * Baselines updated during this proof run.
   * Baselines are updated on review approval, not automatically here —
   * this field records what WOULD be updated if approved.
   */
  readonly baselines_updated: readonly string[];
};

// ─── spec-gap ─────────────────────────────────────────────────────────────────

/** Category of spec-gap finding. */
export type SpecGapFindingCategory =
  | "config_completeness"
  | "spec_code_alignment"
  | "prompt_template_consistency"
  | "cross_platform_parity"
  | "task_hygiene";

/** A single finding from the spec-gap agent. */
export type SpecGapFinding = {
  readonly category: SpecGapFindingCategory;
  readonly description: string;
  /** Task IDs created for this finding (may be empty). */
  readonly task_ids: readonly string[];
};

/**
 * Result schema for the `spec-gap` agent.
 * Spec: docs/spec/agents.md §`spec-gap` — Submit.
 */
export type SpecGapResult = {
  /** Count of findings per category. */
  readonly summary: Readonly<Record<SpecGapFindingCategory, number>>;
  /** Individual findings with task IDs. Empty array is valid (allows finalizer to proceed). */
  readonly findings: readonly SpecGapFinding[];
};

// ─── docs ────────────────────────────────────────────────────────────────────

/**
 * Result schema for the `docs` agent.
 * Spec: docs/spec/agents.md §`docs` — Submit.
 */
export type DocsResult = {
  /** Files modified in this docs run. */
  readonly files_modified: readonly FilePath[];
  /** Human-readable summary of changes. */
  readonly summary: string;
};

// ─── spec-review ─────────────────────────────────────────────────────────────

/**
 * Result schema for the `spec-review` agent.
 * Spec: docs/spec/agents.md §`spec-review` — Submit.
 *
 * Variant A: coverage-only (does the change satisfy acceptance criteria?).
 * Variant B: full findings (coverage + gaps with task IDs).
 */
export type SpecReviewResult =
  | {
      readonly variant: "A";
      /** Whether acceptance criteria are satisfied. */
      readonly criteria_satisfied: boolean;
      /** Brief explanation. */
      readonly summary: string;
    }
  | {
      readonly variant: "B";
      readonly verdict: "approved" | "changes_requested" | "reject";
      /** Findings as tasks (same mechanism as `review`). */
      readonly findings: readonly {
        readonly title: string;
        readonly description: string;
        readonly task_ids: readonly string[];
      }[];
      readonly summary: string;
    };

// ─── Orchestrator scan result ────────────────────────────────────────────────

/**
 * Result schema for orchestrator-side scan agents (`orch_scan`,
 * `orch_maintenance_dependencies`, `orch_maintenance_tests`,
 * `orch_maintenance_docs`, `orch_maintenance_demos`,
 * `orch_maintenance_refactor`).
 *
 * Spec: docs/spec/agents.md §Orchestrator-side agents — scan result.
 */
export type ScanResult = {
  /**
   * What the scan decided should happen next.
   * "decompose" | "refine" | "dispatch" | "review" | "diagnose" | "conversation" | "no_action"
   */
  readonly decision: string;
  /** Brief reasoning for the decision. */
  readonly rationale: string;
  /**
   * Events to queue as a result of this scan.
   * Each entry is a trigger name understood by the orchestrator workflow.
   */
  readonly queued_events: readonly string[];
};

// ─── Orchestrator decompose / refine / estimate ───────────────────────────────

/**
 * A work item (Epic or Story) in orchestrator decomposition results.
 */
export type OrchestratorWorkItem = {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
  readonly dependencies?: readonly string[]; // slugs of other work items
  readonly wave?: number;
  readonly estimated_complexity?: string;
};

/**
 * Result schema for `orch_decompose`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Epic decomposition.
 */
export type DecomposeResult = {
  readonly epics: readonly OrchestratorWorkItem[];
};

/**
 * Result schema for `orch_sub_decompose`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Story decomposition.
 */
export type SubDecomposeResult = {
  readonly epic_slug: string;
  readonly stories: readonly OrchestratorWorkItem[];
};

/**
 * Abstract status values used in refinement results.
 * Mirrors tracker-agnostic abstract_status vocabulary.
 */
export type AbstractStatus =
  | "needs_refinement"
  | "refined"
  | "dor_validated"
  | "in_progress"
  | "in_review"
  | "done";

/**
 * Result schema for `orch_refine` (Epic or Story refinement).
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Epic refinement / Story refinement.
 */
export type RefineResult = {
  readonly ref: {
    readonly slug: string;
    readonly kind: "epic" | "story";
  };
  readonly title: string;
  readonly body: string;
  readonly abstract_status: AbstractStatus;
  /** Explicit out-of-scope items. */
  readonly out_of_scope?: readonly string[];
  /** Constraints added during refinement. */
  readonly constraints?: readonly string[];
  /** Workflow selected for this work item (for stories, at dor_validated). */
  readonly workflow?: string;
  /** Refinement basis snapshot — see orchestrator.md §Story refinement. */
  readonly refinement_basis?: {
    readonly checked_at: string; // ISO-8601
    readonly spec_revision: string;
    readonly story_updated_at: string;
    readonly epic_updated_at: string;
    readonly dependency_story_refs?: readonly { readonly slug: string; readonly updated_at: string }[];
    readonly related_story_refs?: readonly { readonly slug: string; readonly updated_at: string }[];
  };
};

/**
 * Complexity tier used in estimate results.
 * Spec: docs/spec/orchestrator.md §Complexity tier.
 */
export type ComplexityTier = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Result schema for `orch_estimate`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Estimate phase.
 */
export type EstimateResult = {
  readonly ref: {
    readonly slug: string;
    readonly kind: "epic" | "story";
  };
  readonly complexity_tier: ComplexityTier;
  /** Adjustments to dependency graph (added/removed dependencies). */
  readonly dependency_changes?: readonly {
    readonly action: "add" | "remove";
    readonly target_slug: string;
  }[];
  /** Metadata updates (labels, etc.) to persist on the work item. */
  readonly metadata_updates?: Readonly<Record<string, unknown>>;
};

// ─── Orchestrator consistency ─────────────────────────────────────────────────

/**
 * Verdict of a pre-dispatch consistency check.
 * Spec: docs/spec/orchestrator.md §Pre-dispatch consistency check.
 */
export type ConsistencyVerdict = "clean" | "stale" | "blocked";

/**
 * Reason a story was found stale or blocked.
 * Spec: docs/spec/orchestrator.md §Default daemon behavior on drift.
 */
export type ConsistencyDriftReason = {
  readonly code: string; // e.g. "spec_newer", "story_updated", "dep_changed"
  readonly description: string;
};

/**
 * Result schema for `orch_consistency`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Pre-dispatch consistency check.
 */
export type ConsistencyResult = {
  readonly verdict: ConsistencyVerdict;
  /** For stale/blocked: reasons detected. Empty if clean. */
  readonly drift_reasons?: readonly ConsistencyDriftReason[];
  /** Stories checked; only those with non-clean verdicts need full re-refine. */
  readonly stories_checked: readonly string[];
};

// ─── Orchestrator dispatch ────────────────────────────────────────────────────

/**
 * A single story to dispatch, with workflow and provider chain.
 * Spec: docs/spec/orchestrator.md §Dispatch.
 */
export type DispatchStoryEntry = {
  readonly story_ref: { readonly slug: string };
  readonly workflow: string;
  readonly provider_chain: readonly string[];
};

/**
 * Result schema for `orch_dispatch`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Dispatch.
 */
export type DispatchResult = {
  readonly stories: readonly DispatchStoryEntry[];
};

// ─── Orchestrator diagnose ────────────────────────────────────────────────────

/**
 * Actions the diagnose agent can request.
 * Spec: docs/spec/orchestrator.md §Self-healing via diagnose workflow.
 */
export type DiagnoseAction =
  | { readonly type: "no_action" }
  | { readonly type: "pause_dispatch" }
  | { readonly type: "pause_session"; readonly session_id: string }
  | { readonly type: "stop_session"; readonly session_id: string; readonly reason?: string }
  | { readonly type: "raise_threshold"; readonly gate: string; readonly value: number }
  | { readonly type: "redispatch"; readonly issue_ref: string }
  | {
      readonly type: "file_followup_issue";
      readonly draft: {
        readonly title: string;
        readonly body: string;
        readonly labels?: readonly string[];
      };
    };

/**
 * Result schema for `orch_diagnose`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Self-healing via diagnose workflow.
 */
export type DiagnoseResult = {
  readonly session_id?: string;
  readonly issue_ref?: string;
  readonly action: DiagnoseAction;
  readonly rationale: string;
};

// ─── Orchestrator conversation ────────────────────────────────────────────────

/**
 * Actions the conversation agent can request in response to a human comment.
 * Spec: docs/spec/orchestrator.md §Epic/Story conversations.
 */
export type ConversationAction =
  | { readonly type: "reply"; readonly body: string }
  | {
      readonly type: "edit_work_item";
      readonly patch: {
        readonly title?: string;
        readonly body?: string;
        readonly labels?: readonly string[];
        readonly status?: string;
      };
    }
  | { readonly type: "refine_again"; readonly work_item_ref: string }
  | { readonly type: "decompose_again"; readonly epic_ref: string }
  | { readonly type: "pause_dispatch_for"; readonly work_item_ref: string }
  | { readonly type: "inject_into_child"; readonly session_id: string; readonly instruction: string }
  | {
      readonly type: "file_followup";
      readonly draft: {
        readonly kind: "epic" | "story";
        readonly title: string;
        readonly body: string;
        readonly labels?: readonly string[];
      };
    }
  | { readonly type: "no_action" };

/**
 * Result schema for `orch_conversation`.
 * Spec: docs/spec/agents.md §Orchestrator-side agents.
 * Spec: docs/spec/orchestrator.md §Epic/Story conversations.
 */
export type ConversationResult = {
  readonly comment_author: string;
  readonly work_item_ref: string;
  readonly action: ConversationAction;
  readonly rationale: string;
};

// ─── Setup agent results ──────────────────────────────────────────────────────

/**
 * A finding from the setup discovery phase.
 * Spec: docs/spec/agents.md §Setup-side agents.
 */
export type SetupDiscoveryFinding = {
  readonly category: string;
  readonly description: string;
  readonly severity?: "info" | "warning" | "error";
};

/**
 * Result schema for `setup_discover`.
 * Spec: docs/spec/agents.md §Setup-side agents.
 */
export type SetupDiscoveryResult = {
  readonly findings: readonly SetupDiscoveryFinding[];
  readonly summary: string;
};

/**
 * Result schema for `setup_research`.
 * Spec: docs/spec/agents.md §Setup-side agents.
 */
export type SetupResearchResult = {
  readonly question: string;
  readonly answer: string;
  readonly sources?: readonly string[];
  readonly confidence: "low" | "medium" | "high";
};

/**
 * A staged question to be answered by a human.
 * Spec: docs/spec/agents.md §Setup-side agents.
 */
export type SetupQuestion = {
  readonly id: string;
  readonly question: string;
  readonly context?: string;
  readonly required: boolean;
};

/**
 * Result schema for `setup_questioner`.
 * Spec: docs/spec/agents.md §Setup-side agents.
 */
export type SetupQuestionBatch = {
  readonly questions: readonly SetupQuestion[];
  readonly summary: string;
};

/**
 * Result schema for `setup_spec_writer` and `setup_constitution_drafter`.
 * Spec: docs/spec/agents.md §Setup-side agents.
 */
export type SetupChapterUpdate = {
  readonly chapter_path: string;
  readonly summary: string;
  readonly changes: {
    /** Specific sections added, modified, or removed. */
    readonly sections?: readonly {
      readonly action: "add" | "modify" | "remove";
      readonly heading: string;
      readonly content?: string;
    }[];
    /** Full new content if a section was replaced wholesale. */
    readonly new_content?: string;
  };
};

// ─── Union of all agent result types ─────────────────────────────────────────

/**
 * Discriminated union of all known agent submit result types.
 * Used for static typing of `AgentChunkData.content.result`.
 *
 * The `type` discriminator corresponds to the `--type` argument passed to
 * `aloop-agent submit --type <name>`.
 */
export type AgentResult =
  | { readonly type: "plan_result"; readonly result: PlanResult }
  | { readonly type: "build_result"; readonly result: BuildResult }
  | { readonly type: "qa_result"; readonly result: QaResult }
  | { readonly type: "review_result"; readonly result: ReviewResult }
  | { readonly type: "proof_result"; readonly result: ProofResult }
  | { readonly type: "spec_gap_result"; readonly result: SpecGapResult }
  | { readonly type: "docs_result"; readonly result: DocsResult }
  | { readonly type: "spec_review_result"; readonly result: SpecReviewResult }
  | { readonly type: "scan_result"; readonly result: ScanResult }
  | { readonly type: "decompose_result"; readonly result: DecomposeResult }
  | { readonly type: "sub_decompose_result"; readonly result: SubDecomposeResult }
  | { readonly type: "refine_result"; readonly result: RefineResult }
  | { readonly type: "estimate_result"; readonly result: EstimateResult }
  | { readonly type: "consistency_result"; readonly result: ConsistencyResult }
  | { readonly type: "dispatch_result"; readonly result: DispatchResult }
  | { readonly type: "diagnose_result"; readonly result: DiagnoseResult }
  | { readonly type: "conversation_result"; readonly result: ConversationResult }
  | { readonly type: "setup_discovery_result"; readonly result: SetupDiscoveryResult }
  | { readonly type: "setup_research_result"; readonly result: SetupResearchResult }
  | { readonly type: "setup_question_batch"; readonly result: SetupQuestionBatch }
  | { readonly type: "setup_chapter_update"; readonly result: SetupChapterUpdate };
