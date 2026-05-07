import { describe, expect, test } from "bun:test";
import type {
  PlanResult,
  BuildResult,
  QaResult,
  ReviewResult,
  ReviewGateName,
  ProofResult,
  SpecGapResult,
  DocsResult,
  SpecReviewResult,
  ScanResult,
  DecomposeResult,
  SubDecomposeResult,
  RefineResult,
  EstimateResult,
  ConsistencyResult,
  DispatchResult,
  DiagnoseResult,
  ConversationResult,
  SetupDiscoveryResult,
  SetupResearchResult,
  SetupQuestionBatch,
  SetupChapterUpdate,
  DiagnoseAction,
  ConversationAction,
  ComplexityTier,
  AbstractStatus,
  AgentResult,
} from "./agent-result-types";

// ─── plan ─────────────────────────────────────────────────────────────────────

describe("PlanResult", () => {
  test("accepts minimal valid shape", () => {
    const r: PlanResult = {
      summary: "Found 3 tasks",
      tasks_updated: ["task-1", "task-2"],
      tasks_closed: [],
    };
    expect(r.summary).toBe("Found 3 tasks");
    expect(r.tasks_updated).toHaveLength(2);
  });

  test("tasks_closed can have entries", () => {
    const r: PlanResult = {
      summary: "Closed stale tasks",
      tasks_updated: [],
      tasks_closed: ["stale-1"],
    };
    expect(r.tasks_closed).toHaveLength(1);
  });
});

// ─── build ────────────────────────────────────────────────────────────────────

describe("BuildResult", () => {
  test("accepts minimal valid shape", () => {
    const r: BuildResult = {
      commit_shas: ["abc123", "def456"],
      changed_files: ["src/index.ts", "src/util.ts"],
      validation_passed: true,
    };
    expect(r.validation_passed).toBe(true);
    expect(r.commit_shas).toHaveLength(2);
  });

  test("accepts optional usage_summary", () => {
    const r: BuildResult = {
      commit_shas: ["abc123"],
      changed_files: ["src/foo.ts"],
      validation_passed: false,
      usage_summary: {
        tokens_in: 1_000,
        tokens_out: 500,
        cost_usd: 0.02,
      },
    };
    expect(r.usage_summary?.cost_usd).toBe(0.02);
  });
});

// ─── qa ──────────────────────────────────────────────────────────────────────

describe("QaResult", () => {
  test("accepts valid shape with pass and fail", () => {
    const r: QaResult = {
      features: [
        { feature: "login", status: "pass" },
        { feature: "logout", status: "pass" },
        { feature: "password reset", status: "fail", notes: "timeout after 30s" },
      ],
      coverage_delta_pct: 2.5,
      bugs_filed: ["bug-42"],
    };
    expect(r.features[2].status).toBe("fail");
    expect(r.bugs_filed).toHaveLength(1);
  });

  test("accepts skipped features", () => {
    const r: QaResult = {
      features: [{ feature: "legacy endpoint", status: "skip", notes: "removed in v2" }],
      bugs_filed: [],
    };
    expect(r.features[0].status).toBe("skip");
  });
});

// ─── review ───────────────────────────────────────────────────────────────────

describe("ReviewGateName", () => {
  test("accepts all nine gate names", () => {
    const gates: ReviewGateName[] = [
      "spec_compliance",
      "test_depth",
      "coverage",
      "code_quality",
      "integration_sanity",
      "proof_verification",
      "layout_verification",
      "version_compliance",
      "doc_freshness",
    ];
    expect(gates).toHaveLength(9);
  });
});

describe("ReviewResult", () => {
  test("approved verdict with all gates passing", () => {
    const r: ReviewResult = {
      verdict: "approved",
      gates: [
        { gate: "spec_compliance", status: "pass", summary: "All criteria met" },
        { gate: "test_depth", status: "pass", summary: "Adequate coverage" },
      ],
      summary: "All gates pass",
    };
    expect(r.verdict).toBe("approved");
  });

  test("changes_requested verdict with findings", () => {
    const r: ReviewResult = {
      verdict: "changes_requested",
      gates: [
        {
          gate: "code_quality",
          status: "fail",
          summary: "High complexity in utils.ts",
          findings: { "src/utils.ts": [12, 15, 18] },
        },
        { gate: "coverage", status: "not_applicable", summary: "No tests required for this module" },
      ],
      summary: "Request changes to utils.ts",
    };
    expect(r.verdict).toBe("changes_requested");
    expect(r.gates[0].findings?.["src/utils.ts"]).toEqual([12, 15, 18]);
  });

  test("reject verdict", () => {
    const r: ReviewResult = { verdict: "reject", gates: [], summary: "Security violations found" };
    expect(r.verdict).toBe("reject");
  });
});

// ─── proof ────────────────────────────────────────────────────────────────────

describe("ProofResult", () => {
  test("accepts deployment_preview artifact", () => {
    const r: ProofResult = {
      iteration: 7,
      phase: "proof",
      provider: "copilot",
      timestamp: "2026-04-18T12:00:00Z",
      summary: "3 screenshots, 1 API capture",
      artifacts: [
        {
          type: "deployment_preview",
          url: "https://feature-x-preview.example.com",
          description: "Live PR preview",
          metadata: { source: "tracker_deployment_status", change_set: "PR-123" },
        },
      ],
      skipped: [],
      baselines_updated: [],
    };
    expect(r.artifacts[0].type).toBe("deployment_preview");
  });

  test("accepts screenshot artifact", () => {
    const r: ProofResult = {
      iteration: 1,
      phase: "proof",
      provider: "opencode",
      timestamp: "2026-04-18T13:00:00Z",
      summary: "Layout verified",
      artifacts: [
        {
          type: "screenshot",
          path: "dashboard-main.png",
          description: "Dashboard after layout refactor",
          metadata: { viewport: "1920x1080", url: "http://localhost:3000" },
        },
      ],
      skipped: [],
      baselines_updated: [],
    };
    expect(r.artifacts[0].type).toBe("screenshot");
  });

  test("accepts skipped tasks", () => {
    const r: ProofResult = {
      iteration: 3,
      phase: "proof",
      provider: "opencode",
      timestamp: "2026-04-18T14:00:00Z",
      summary: "Pure refactor — nothing provable",
      artifacts: [],
      skipped: [
        { task: "internal file-lock retry", reason: "no observable external output" },
      ],
      baselines_updated: [],
    };
    expect(r.skipped).toHaveLength(1);
  });

  test("accepts visual_diff artifact", () => {
    const r: ProofResult = {
      iteration: 4,
      phase: "proof",
      provider: "copilot",
      timestamp: "2026-04-18T15:00:00Z",
      summary: "12.3% change vs baseline",
      artifacts: [
        {
          type: "visual_diff",
          path: "dashboard-main-diff.png",
          description: "12.3% change vs baseline, confined to log panel",
          metadata: { baseline: "baselines/dashboard-main.png", diff_percentage: 12.3 },
        },
      ],
      skipped: [],
      baselines_updated: ["dashboard-main.png"],
    };
    expect(r.baselines_updated).toContain("dashboard-main.png");
  });
});

// ─── spec-gap ─────────────────────────────────────────────────────────────────

describe("SpecGapResult", () => {
  test("accepts findings with task IDs", () => {
    const r: SpecGapResult = {
      summary: {
        config_completeness: 1,
        spec_code_alignment: 2,
        prompt_template_consistency: 0,
        cross_platform_parity: 0,
        task_hygiene: 0,
      },
      findings: [
        {
          category: "spec_code_alignment",
          description: "Acceptance criterion 'dark mode' has no implementation",
          task_ids: ["task-99"],
        },
      ],
    };
    expect(r.findings[0].category).toBe("spec_code_alignment");
  });

  test("empty findings is valid", () => {
    const r: SpecGapResult = {
      summary: {
        config_completeness: 0,
        spec_code_alignment: 0,
        prompt_template_consistency: 0,
        cross_platform_parity: 0,
        task_hygiene: 0,
      },
      findings: [],
    };
    expect(r.findings).toHaveLength(0);
  });
});

// ─── docs ────────────────────────────────────────────────────────────────────

describe("DocsResult", () => {
  test("accepts valid shape", () => {
    const r: DocsResult = {
      files_modified: ["README.md", "docs/API.md"],
      summary: "Updated README with new installation steps",
    };
    expect(r.files_modified).toHaveLength(2);
  });
});

// ─── spec-review ──────────────────────────────────────────────────────────────

describe("SpecReviewResult", () => {
  test("variant A — coverage only", () => {
    const r: SpecReviewResult = {
      variant: "A",
      criteria_satisfied: true,
      summary: "All acceptance criteria met",
    };
    expect(r.variant).toBe("A");
  });

  test("variant B — full findings", () => {
    const r: SpecReviewResult = {
      variant: "B",
      verdict: "changes_requested",
      findings: [
        {
          title: "Missing error handling",
          description: "The new API endpoint lacks error responses",
          task_ids: ["task-5"],
        },
      ],
      summary: "Gap found in error handling",
    };
    expect(r.variant).toBe("B");
    expect(r.findings[0].task_ids).toContain("task-5");
  });
});

// ─── ScanResult ────────────────────────────────────────────────────────────────

describe("ScanResult", () => {
  test("decision decompose", () => {
    const r: ScanResult = {
      decision: "decompose",
      rationale: "No epics found; decomposition needed",
      queued_events: ["decompose_needed"],
    };
    expect(r.decision).toBe("decompose");
  });

  test("decision no_action", () => {
    const r: ScanResult = {
      decision: "no_action",
      rationale: "All children running normally",
      queued_events: [],
    };
    expect(r.decision).toBe("no_action");
  });
});

// ─── Orchestrator work items ───────────────────────────────────────────────────

describe("DecomposeResult", () => {
  test("accepts epic with dependencies and wave", () => {
    const r: DecomposeResult = {
      epics: [
        {
          slug: "auth-overhaul",
          title: "Authentication Overhaul",
          body: "Replace legacy auth with OAuth 2.0",
          labels: ["p1"],
          dependencies: [],
          wave: 1,
        },
        {
          slug: "api-v2",
          title: "API v2",
          body: "Design new API surface",
          dependencies: ["auth-overhaul"],
          wave: 2,
        },
      ],
    };
    expect(r.epics).toHaveLength(2);
    expect(r.epics[1].dependencies).toContain("auth-overhaul");
  });
});

describe("SubDecomposeResult", () => {
  test("accepts stories under an epic", () => {
    const r: SubDecomposeResult = {
      epic_slug: "auth-overhaul",
      stories: [
        {
          slug: "auth-oauth2-implementation",
          title: "Implement OAuth 2.0 flow",
          body: "...",
          estimated_complexity: "lg",
        },
      ],
    };
    expect(r.epic_slug).toBe("auth-overhaul");
    expect(r.stories[0].estimated_complexity).toBe("lg");
  });
});

describe("AbstractStatus", () => {
  test("accepts all abstract status values", () => {
    const statuses: AbstractStatus[] = [
      "needs_refinement",
      "refined",
      "dor_validated",
      "in_progress",
      "in_review",
      "done",
    ];
    expect(statuses).toHaveLength(6);
  });
});

describe("RefineResult", () => {
  test("refine epic with out_of_scope and constraints", () => {
    const r: RefineResult = {
      ref: { slug: "auth-overhaul", kind: "epic" },
      title: "Authentication Overhaul",
      body: "Full auth redesign",
      abstract_status: "refined",
      out_of_scope: ["legacy session tokens"],
      constraints: ["must work with existing DB schema for users table"],
    };
    expect(r.abstract_status).toBe("refined");
  });

  test("refine story with workflow and refinement_basis", () => {
    const r: RefineResult = {
      ref: { slug: "auth-oauth2-implementation", kind: "story" },
      title: "OAuth 2.0 Implementation",
      body: "...",
      abstract_status: "dor_validated",
      workflow: "story-standard",
      refinement_basis: {
        checked_at: "2026-04-21T10:12:00Z",
        spec_revision: "specrev_2026-04-21T10:05:11Z",
        story_updated_at: "2026-04-21T10:12:00Z",
        epic_updated_at: "2026-04-21T09:48:02Z",
        dependency_story_refs: [{ slug: "permit-persistence", updated_at: "2026-04-21T09:40:17Z" }],
        related_story_refs: [{ slug: "scheduler-reconcile", updated_at: "2026-04-21T09:58:33Z" }],
      },
    };
    expect(r.workflow).toBe("story-standard");
    expect(r.refinement_basis?.spec_revision).toBe("specrev_2026-04-21T10:05:11Z");
  });
});

describe("ComplexityTier", () => {
  test("accepts all complexity tiers", () => {
    const tiers: ComplexityTier[] = ["xs", "sm", "md", "lg", "xl"];
    expect(tiers).toHaveLength(5);
  });
});

describe("EstimateResult", () => {
  test("accepts estimate with dependency changes", () => {
    const r: EstimateResult = {
      ref: { slug: "auth-oauth2-implementation", kind: "story" },
      complexity_tier: "lg",
      dependency_changes: [
        { action: "add", target_slug: "permit-persistence" },
      ],
    };
    expect(r.complexity_tier).toBe("lg");
    expect(r.dependency_changes?.[0].action).toBe("add");
  });
});

// ─── ConsistencyResult ────────────────────────────────────────────────────────

describe("ConsistencyResult", () => {
  test("clean verdict", () => {
    const r: ConsistencyResult = {
      verdict: "clean",
      stories_checked: ["auth-oauth2-implementation", "api-v2-base"],
    };
    expect(r.verdict).toBe("clean");
  });

  test("stale verdict with drift reasons", () => {
    const r: ConsistencyResult = {
      verdict: "stale",
      drift_reasons: [
        {
          code: "spec_newer",
          description: "spec.md was updated after this story was last refined",
        },
      ],
      stories_checked: ["auth-oauth2-implementation"],
    };
    expect(r.verdict).toBe("stale");
    expect(r.drift_reasons?.[0].code).toBe("spec_newer");
  });

  test("blocked verdict", () => {
    const r: ConsistencyResult = {
      verdict: "blocked",
      drift_reasons: [
        { code: "dep_changed", description: "Dependency was removed" },
      ],
      stories_checked: ["story-x"],
    };
    expect(r.verdict).toBe("blocked");
  });
});

// ─── DispatchResult ────────────────────────────────────────────────────────────

describe("DispatchResult", () => {
  test("accepts stories with workflow and provider chain", () => {
    const r: DispatchResult = {
      stories: [
        {
          story_ref: { slug: "auth-oauth2-implementation" },
          workflow: "story-standard",
          provider_chain: ["opencode", "copilot"],
        },
      ],
    };
    expect(r.stories[0].provider_chain).toHaveLength(2);
  });
});

// ─── DiagnoseResult ───────────────────────────────────────────────────────────

describe("DiagnoseResult", () => {
  test("no_action", () => {
    const r: DiagnoseResult = {
      action: { type: "no_action" },
      rationale: "Event is expected behavior",
    };
    expect(r.action.type).toBe("no_action");
  });

  test("pause_dispatch", () => {
    const r: DiagnoseResult = {
      action: { type: "pause_dispatch" },
      rationale: "Budget at 80%, pausing new dispatches",
    };
    expect(r.action.type).toBe("pause_dispatch");
  });

  test("pause_session", () => {
    const r: DiagnoseResult = {
      session_id: "sess-abc123",
      action: { type: "pause_session", session_id: "sess-abc123" },
      rationale: "Child stuck on network call",
    };
    expect(r.action.type).toBe("pause_session");
  });

  test("stop_session with reason", () => {
    const r: DiagnoseResult = {
      session_id: "sess-xyz",
      action: { type: "stop_session", session_id: "sess-xyz", reason: "repeated failures" },
      rationale: "Session failed 3 times",
    };
    expect(r.action.type).toBe("stop_session");
    expect(r.action.reason).toBe("repeated failures");
  });

  test("raise_threshold", () => {
    const r: DiagnoseResult = {
      action: { type: "raise_threshold", gate: "burn_rate", value: 20 },
      rationale: "Current threshold too conservative for this project",
    };
    expect(r.action.type).toBe("raise_threshold");
    expect(r.action.value).toBe(20);
  });

  test("redispatch", () => {
    const r: DiagnoseResult = {
      issue_ref: "auth-oauth2-implementation",
      action: { type: "redispatch", issue_ref: "auth-oauth2-implementation" },
      rationale: "Previous attempt had wrong provider chain",
    };
    expect(r.action.type).toBe("redispatch");
  });

  test("file_followup_issue", () => {
    const r: DiagnoseResult = {
      action: {
        type: "file_followup_issue",
        draft: {
          title: "Investigate stuck child sessions",
          body: "Session sess-abc repeatedly fails at network step",
          labels: ["bug", "investigation"],
        },
      },
      rationale: "Systemic issue needs tracking",
    };
    expect(r.action.type).toBe("file_followup_issue");
    expect(r.action.draft.labels).toContain("bug");
  });
});

// ─── ConversationResult ───────────────────────────────────────────────────────

describe("ConversationResult", () => {
  test("reply", () => {
    const r: ConversationResult = {
      comment_author: "alice",
      work_item_ref: "auth-oauth2-implementation",
      action: {
        type: "reply",
        body: "We decided to defer OAuth to v3 — see the decision record.",
      },
      rationale: "Human asked about timeline; providing context",
    };
    expect(r.action.type).toBe("reply");
  });

  test("edit_work_item", () => {
    const r: ConversationResult = {
      comment_author: "bob",
      work_item_ref: "auth-oauth2-implementation",
      action: {
        type: "edit_work_item",
        patch: { labels: ["p1", "deferred"] },
      },
      rationale: "Updating labels based on human request",
    };
    expect(r.action.type).toBe("edit_work_item");
    expect(r.action.patch.labels).toContain("deferred");
  });

  test("refine_again", () => {
    const r: ConversationResult = {
      comment_author: "carol",
      work_item_ref: "api-v2",
      action: { type: "refine_again", work_item_ref: "api-v2" },
      rationale: "Scope changed significantly",
    };
    expect(r.action.type).toBe("refine_again");
  });

  test("decompose_again", () => {
    const r: ConversationResult = {
      comment_author: "dave",
      work_item_ref: "auth-overhaul",
      action: { type: "decompose_again", epic_ref: "auth-overhaul" },
      rationale: "Epic is too large; splitting required",
    };
    expect(r.action.type).toBe("decompose_again");
  });

  test("pause_dispatch_for", () => {
    const r: ConversationResult = {
      comment_author: "eve",
      work_item_ref: "story-42",
      action: { type: "pause_dispatch_for", work_item_ref: "story-42" },
      rationale: "Human explicitly paused this story",
    };
    expect(r.action.type).toBe("pause_dispatch_for");
  });

  test("inject_into_child", () => {
    const r: ConversationResult = {
      comment_author: "frank",
      work_item_ref: "auth-oauth2-implementation",
      action: {
        type: "inject_into_child",
        session_id: "sess-abc123",
        instruction: "Please retry with a shorter timeout for the OAuth token endpoint",
      },
      rationale: "Human provided guidance on timeout",
    };
    expect(r.action.type).toBe("inject_into_child");
  });

  test("file_followup epic", () => {
    const r: ConversationResult = {
      comment_author: "grace",
      work_item_ref: "auth-overhaul",
      action: {
        type: "file_followup",
        draft: {
          kind: "epic",
          title: "Security Audit — Auth Module",
          body: "Post-launch security review needed",
          labels: ["security"],
        },
      },
      rationale: "Human requested follow-up epic",
    };
    expect(r.action.type).toBe("file_followup");
    expect(r.action.draft.kind).toBe("epic");
  });

  test("no_action", () => {
    const r: ConversationResult = {
      comment_author: "heidi",
      work_item_ref: "auth-oauth2-implementation",
      action: { type: "no_action" },
      rationale: "Comment was informational thumbs-up",
    };
    expect(r.action.type).toBe("no_action");
  });
});

// ─── Setup agent results ──────────────────────────────────────────────────────

describe("SetupDiscoveryResult", () => {
  test("accepts findings with severity", () => {
    const r: SetupDiscoveryResult = {
      findings: [
        { category: "environment", description: "Node 22 available", severity: "info" },
        { category: "config", description: "pipeline.yml missing", severity: "warning" },
        { category: "tracker", description: "GitHub token invalid", severity: "error" },
      ],
      summary: "3 findings",
    };
    expect(r.findings[2].severity).toBe("error");
  });
});

describe("SetupResearchResult", () => {
  test("accepts all confidence levels", () => {
    const levels: SetupResearchResult["confidence"][] = ["low", "medium", "high"];
    expect(levels).toHaveLength(3);
  });
});

describe("SetupQuestionBatch", () => {
  test("accepts required and optional questions", () => {
    const r: SetupQuestionBatch = {
      questions: [
        { id: "q1", question: "Which auth provider do you use?", required: true },
        { id: "q2", question: "Any existing docs?", required: false, context: "Optional, for docs agent" },
      ],
      summary: "2 questions staged",
    };
    expect(r.questions[0].required).toBe(true);
    expect(r.questions[1].context).toBe("Optional, for docs agent");
  });
});

describe("SetupChapterUpdate", () => {
  test("accepts section-level changes", () => {
    const r: SetupChapterUpdate = {
      chapter_path: "docs/spec/architecture.md",
      summary: "Added security section",
      changes: {
        sections: [
          {
            action: "add",
            heading: "Security Considerations",
            content: "All API calls must be authenticated...",
          },
        ],
      },
    };
    expect(r.changes.sections?.[0].action).toBe("add");
  });

  test("accepts new_content for wholesale replacement", () => {
    const r: SetupChapterUpdate = {
      chapter_path: "docs/spec/pipeline.md",
      summary: "Full pipeline section rewrite",
      changes: {
        new_content: "# Pipeline\n\nAll work flows through...",
      },
    };
    expect(r.changes.new_content).toContain("# Pipeline");
  });
});

// ─── AgentResult discriminated union ──────────────────────────────────────────

describe("AgentResult discriminated union", () => {
  test("plan_result", () => {
    const r: AgentResult = {
      type: "plan_result",
      result: { summary: "ok", tasks_updated: [], tasks_closed: [] },
    };
    expect(r.type).toBe("plan_result");
  });

  test("build_result", () => {
    const r: AgentResult = {
      type: "build_result",
      result: { commit_shas: [], changed_files: [], validation_passed: true },
    };
    expect(r.type).toBe("build_result");
  });

  test("diagnose_result", () => {
    const r: AgentResult = {
      type: "diagnose_result",
      result: { action: { type: "no_action" }, rationale: "ok" },
    };
    expect(r.type).toBe("diagnose_result");
  });

  test("conversation_result", () => {
    const r: AgentResult = {
      type: "conversation_result",
      result: {
        comment_author: "alice",
        work_item_ref: "epic-1",
        action: { type: "no_action" },
        rationale: "info only",
      },
    };
    expect(r.type).toBe("conversation_result");
  });

  test("setup_chapter_update", () => {
    const r: AgentResult = {
      type: "setup_chapter_update",
      result: { chapter_path: "x", summary: "y", changes: { sections: [] } },
    };
    expect(r.type).toBe("setup_chapter_update");
  });
});
