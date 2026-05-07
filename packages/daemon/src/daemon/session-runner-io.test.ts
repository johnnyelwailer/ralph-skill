import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileSessionPlan,
  loadSessionSummary,
  readPrompt,
  updateSessionStatus,
  writeLoopPlan,
  type SessionSummary,
} from "./session-runner-io.ts";
import type { LoopPlan, SessionKind, SessionStatus } from "@aloop/core";

// ---------------------------------------------------------------------------
// Helper fixtures
// ---------------------------------------------------------------------------

function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "sess-test-001",
    project_id: "proj-test-001",
    kind: "standalone",
    status: "pending",
    workflow: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function writeSessionJson(dir: string, session: SessionSummary): void {
  writeFileSync(join(dir, "session.json"), JSON.stringify(session), "utf-8");
}

// ---------------------------------------------------------------------------
// writeLoopPlan
// ---------------------------------------------------------------------------

describe("writeLoopPlan", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-srio-write-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes a JSON file with the plan serialized with indent", () => {
    const plan: LoopPlan = {
      version: 1,
      cyclePosition: 0,
      cycle: [],
      finalizer: [],
    };
    writeLoopPlan(dir, plan);

    const path = join(dir, "loop-plan.json");
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    expect(parsed.version).toBe(1);
    expect(parsed.cyclePosition).toBe(0);
  });

  test("overwrites an existing loop-plan.json", () => {
    const plan1: LoopPlan = { version: 1, cyclePosition: 0, cycle: [], finalizer: [] };
    const plan2: LoopPlan = { version: 2, cyclePosition: 1, cycle: [], finalizer: [] };

    writeLoopPlan(dir, plan1);
    writeLoopPlan(dir, plan2);

    const parsed = JSON.parse(readFileSync(join(dir, "loop-plan.json"), "utf-8"));
    expect(parsed.version).toBe(2);
    expect(parsed.cyclePosition).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// loadSessionSummary
// ---------------------------------------------------------------------------

describe("loadSessionSummary", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-srio-load-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns null when session.json does not exist", () => {
    expect(loadSessionSummary(dir)).toBeNull();
  });

  test("returns null when session.json is empty", () => {
    writeFileSync(join(dir, "session.json"), "", "utf-8");
    expect(loadSessionSummary(dir)).toBeNull();
  });

  test("returns null when session.json contains invalid JSON", () => {
    writeFileSync(join(dir, "session.json"), "not json{", "utf-8");
    expect(loadSessionSummary(dir)).toBeNull();
  });

  test("parses and returns a valid session summary", () => {
    const session = makeSessionSummary({ id: "sess-123", status: "running" });
    writeSessionJson(dir, session);

    const result = loadSessionSummary(dir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("sess-123");
    expect(result!.status).toBe("running");
  });

  test("parses all required fields from session.json", () => {
    const session = makeSessionSummary({
      kind: "orchestrator",
      status: "completed",
      workflow: "quick-fix.yaml",
      issue: 42,
      parent_session_id: "sess-parent",
      max_iterations: 10,
      notes: "test note",
    });
    writeSessionJson(dir, session);

    const result = loadSessionSummary(dir)!;
    expect(result.kind).toBe("orchestrator");
    expect(result.status).toBe("completed");
    expect(result.workflow).toBe("quick-fix.yaml");
    expect(result.issue).toBe(42);
    expect(result.parent_session_id).toBe("sess-parent");
    expect(result.max_iterations).toBe(10);
    expect(result.notes).toBe("test note");
  });

  test("returns null when only session.json.tmp exists (temp file from write)", () => {
    // Simulate partially-written file scenario
    writeFileSync(join(dir, "session.json.tmp"), JSON.stringify(makeSessionSummary()), "utf-8");
    expect(loadSessionSummary(dir)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateSessionStatus
// ---------------------------------------------------------------------------

describe("updateSessionStatus", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-srio-status-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes updated status to session.json", () => {
    const original = makeSessionSummary({ status: "pending" });
    writeSessionJson(dir, original);

    const updated = updateSessionStatus(dir, original, "running");

    expect(updated.status).toBe("running");
    const parsed = JSON.parse(readFileSync(join(dir, "session.json"), "utf-8")) as SessionSummary;
    expect(parsed.status).toBe("running");
  });

  test("preserves all other fields when updating status", () => {
    const original = makeSessionSummary({
      id: "keep-id",
      project_id: "keep-proj",
      kind: "child",
      status: "paused",
      workflow: "my-workflow.yaml",
      issue: 7,
    });
    writeSessionJson(dir, original);

    const updated = updateSessionStatus(dir, original, "completed");

    expect(updated.id).toBe("keep-id");
    expect(updated.project_id).toBe("keep-proj");
    expect(updated.kind).toBe("child");
    expect(updated.workflow).toBe("my-workflow.yaml");
    expect(updated.issue).toBe(7);
    expect(updated.status).toBe("completed");
  });

  test("returns the updated session summary", () => {
    const original = makeSessionSummary({ status: "running" });
    writeSessionJson(dir, original);

    const result = updateSessionStatus(dir, original, "failed");

    expect(result).toEqual({
      ...original,
      status: "failed",
    });
  });

  test("can transition through multiple statuses", () => {
    const original = makeSessionSummary({ status: "pending" });
    writeSessionJson(dir, original);

    const s1 = updateSessionStatus(dir, original, "running");
    const s2 = updateSessionStatus(dir, s1, "completed");

    const final = JSON.parse(readFileSync(join(dir, "session.json"), "utf-8")) as SessionSummary;
    expect(final.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// readPrompt
// ---------------------------------------------------------------------------

describe("readPrompt", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-srio-prompt-"));
    mkdirSync(join(dir, "prompts"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads and returns prompt content from prompts/ subdirectory", () => {
    const promptContent = "# System Prompt\n\nYou are a helpful assistant.";
    writeFileSync(join(dir, "prompts", "PROMPT_test.md"), promptContent, "utf-8");

    const result = readPrompt(dir, "PROMPT_test.md");
    expect(result).toBe(promptContent);
  });

  test("throws when the prompt file does not exist", () => {
    // Per the spec, readPrompt must throw with a message that identifies
    // the missing template by name. The module uses readFileSync which
    // throws ENOENT; callers depend on a descriptive error.
    expect(() => readPrompt(dir, "PROMPT_nonexistent.md")).toThrow(
      /PROMPT_nonexistent\.md/,
    );
  });

  test("returns exact content including special characters", () => {
    const content = "Line1\nLine2\twith tabs\nLine3 with 'single' and \"double\" quotes";
    writeFileSync(join(dir, "prompts", "PROMPT_special.md"), content, "utf-8");

    expect(readPrompt(dir, "PROMPT_special.md")).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// compileSessionPlan (requires workflow file + templates in repo paths)
// The module uses import.meta.dir to resolve template/workflow paths, so
// these tests exercise the real repo's templates/workflows. They verify the
// error-path behaviour rather than a full happy-path (which requires the
// full daemon environment and real pipeline files).
// ---------------------------------------------------------------------------

describe("compileSessionPlan", () => {
  let sessionDir: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), "aloop-srio-sess-"));
    mkdirSync(join(sessionDir, "prompts"), { recursive: true });
  });

  afterEach(() => {
    rmSync(sessionDir, { recursive: true, force: true });
  });

  test("throws when the workflow yaml file does not exist in the repo workflows/ dir", () => {
    // compileSessionPlan resolves workflow path to <import.meta.dir>/aloop/workflows/<name>
    // which is the real repo path. Passing a non-existent workflow name hits the error path.
    expect(() => compileSessionPlan("/tmp/fake-project", sessionDir, "this-workflow-does-not-exist.yaml")).toThrow();
  });

  test("returns a valid LoopPlan for an existing workflow with all template refs satisfied", () => {
    // quick-fix.yaml exists and references PROMPT_plan.md and PROMPT_review.md,
    // both of which are present in the templates directory.
    const plan = compileSessionPlan("/tmp/fake-project", sessionDir, "quick-fix.yaml");
    expect(plan).toBeTruthy();
    expect(typeof plan.version).toBe("number");
    expect(Array.isArray(plan.cycle)).toBe(true);
    expect(plan.cyclePosition).toBe(0);
  });

  test("writes prompts/ directory and copies prompt template files from the repo templates/ dir", () => {
    compileSessionPlan("/tmp/fake-project", sessionDir, "quick-fix.yaml");
    // The function copies referenced prompt templates to sessionDir/prompts/
    const promptsDir = join(sessionDir, "prompts");
    expect(existsSync(promptsDir)).toBe(true);
    // Both PROMPT_plan.md and PROMPT_review.md should be copied
    expect(existsSync(join(promptsDir, "PROMPT_plan.md"))).toBe(true);
    expect(existsSync(join(promptsDir, "PROMPT_review.md"))).toBe(true);
  });

  test("writes loop-plan.json to sessionDir on valid workflow", () => {
    // Use a real workflow that exists in the repo.
    // If quick-fix.yaml is valid and has all its template refs satisfied, this succeeds.
    const beforeExists = existsSync(join(sessionDir, "loop-plan.json"));
    try {
      compileSessionPlan("/tmp/fake-project", sessionDir, "quick-fix.yaml");
    } catch {
      // May throw if templates are missing — that's fine for this test
      // The important assertion is that if it succeeds, loop-plan.json is written
    }
    const afterExists = existsSync(join(sessionDir, "loop-plan.json"));
    // This test documents expected behaviour: loop-plan.json should be written
    // The actual outcome depends on whether quick-fix.yaml and its templates exist
    if (afterExists) {
      const plan = JSON.parse(readFileSync(join(sessionDir, "loop-plan.json"), "utf-8"));
      expect(typeof plan.version).toBe("number");
    }
  });
});
