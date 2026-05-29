import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { compileWorkflow, loadWorkflowFile } from "./compile.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowPlan } from "./types.ts";

const FIXTURE_WORKFLOW = {
  on: {
    start: {
      cycle: true,
      pipeline: [
        { agent: "plan" },
        { agent: "review", onFailure: "goto build" },
        { agent: "build", repeat: 5 },
        { agent: "qa" },
      ],
      finalizer: [
        { agent: "spec-gap" },
        { agent: "docs" },
        { agent: "proof" },
      ],
    },
    steer: {
      pipeline: [{ agent: "steer" }],
    },
    stuck_detected: {
      pipeline: [{ agent: "debug" }],
    },
  },
};

describe("compileWorkflow", () => {
  test("compiles a full start cycle handler with repeat and onFailure", () => {
    const result = compileWorkflow(FIXTURE_WORKFLOW, "plan-build-review", {
      templatesDir: "/tmp/templates",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = result.plan;
    expect(plan.workflow).toBe("plan-build-review");
    expect(plan.version).toBe(1);
    expect(plan._v).toBe(1);
    expect(plan.handlers.start).toBeDefined();
    expect(plan.handlers.start!.cycle).toBe(true);

    const pipeline = plan.handlers.start!.pipeline;
    expect(pipeline.length).toBe(8); // plan + 5×build + qa + review

    // First step: plan
    expect(pipeline[0]).toEqual({ kind: "agent", ref: "PROMPT_plan.md" });

    // review
    expect(pipeline[1]).toEqual({ kind: "agent", ref: "PROMPT_review.md" });

    // Next 5 steps: build (repeat: 5)
    for (let i = 2; i <= 6; i++) {
      expect(pipeline[i]).toEqual({ kind: "agent", ref: "PROMPT_build.md" });
    }

    // qa
    expect(pipeline[7]).toEqual({ kind: "agent", ref: "PROMPT_qa.md" });

    // Transitions: review onFailure → goto build (index 2)
    expect(plan.handlers.start!.transitions["1"]).toEqual({ type: "goto", target: "2" });

    // Finalizer
    const finalizer = plan.handlers.start!.finalizer;
    expect(finalizer).toBeDefined();
    expect(finalizer!.length).toBe(3);
    expect(finalizer![0]).toEqual({ kind: "agent", ref: "PROMPT_spec-gap.md" });
    expect(finalizer![1]).toEqual({ kind: "agent", ref: "PROMPT_docs.md" });
    expect(finalizer![2]).toEqual({ kind: "agent", ref: "PROMPT_proof.md" });
  });

  test("compiles simple pipeline and handler", () => {
    const result = compileWorkflow(
      { on: { steer: { pipeline: [{ agent: "steer" }] } } },
      "simple",
      { templatesDir: "/tmp" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.handlers.steer).toBeDefined();
    expect(result.plan.handlers.steer!.pipeline.length).toBe(1);
    expect(result.plan.handlers.steer!.pipeline[0]).toEqual({ kind: "agent", ref: "PROMPT_steer.md" });
  });

  test("compiles exec steps", () => {
    const result = compileWorkflow(
      {
        on: {
          start: {
            pipeline: [{ agent: "plan" }, { exec: "regen-api" }],
          },
        },
      },
      "with-exec",
      { templatesDir: "/tmp" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const steps = result.plan.handlers.start!.pipeline;
    expect(steps[0]).toEqual({ kind: "agent", ref: "PROMPT_plan.md" });
    expect(steps[1]).toEqual({ kind: "exec", ref: "EXEC_regen-api.yml" });
  });

  test("validates handler names", () => {
    const result = compileWorkflow(
      { on: { invalid_handler: { pipeline: [{ agent: "plan" }] } } },
      "bad-handler",
      { templatesDir: "/tmp" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('"invalid_handler"'))).toBe(true);
  });

  test("returns error for non-object workflow", () => {
    const result = compileWorkflow(null as never, "null-workflow", { templatesDir: "/tmp" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("must be an object");
  });

  test("handles empty workflow", () => {
    const result = compileWorkflow({} as never, "empty", { templatesDir: "/tmp" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.plan.handlers)).toHaveLength(0);
  });

  test("compiles maintenance-loop handlers", () => {
    const result = compileWorkflow(
      {
        on: {
          decompose_needed: { pipeline: [{ agent: "orch_decompose" }, { agent: "orch_refine" }, { agent: "orch_estimate" }] },
          pr_review_needed: { pipeline: [{ agent: "orch_review" }] },
        },
      },
      "maintenance",
      { templatesDir: "/tmp" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.handlers.decompose_needed!.pipeline.length).toBe(3);
    expect(result.plan.handlers.pr_review_needed!.pipeline.length).toBe(1);
  });
});

describe("loadWorkflowFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-compile-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("loads and parses a valid workflow YAML file", () => {
    writeFileSync(
      join(dir, "test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
      - agent: build
`,
      "utf-8",
    );
    const result = loadWorkflowFile("test-workflow", { workflowsDir: dir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw).toBeDefined();
    expect(result.raw.on!.start!.cycle).toBe(true);
  });

  test("returns error when file does not exist", () => {
    const result = loadWorkflowFile("nonexistent", { workflowsDir: dir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("not found");
  });

  test("returns error on malformed YAML", () => {
    writeFileSync(join(dir, "bad.yaml"), "  invalid: yaml: content:\n  - indented wrong", "utf-8");
    const result = loadWorkflowFile("bad", { workflowsDir: dir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("yaml parse error");
  });

  test("rejects onFailure goto target not found in pipeline", () => {
    const result = compileWorkflow(
      {
        on: {
          start: {
            pipeline: [
              { agent: "build", onFailure: "nonexistent_phase" },
            ],
          },
        },
      },
      "bad-goto",
      { templatesDir: "/tmp" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("not found in pipeline");
  });
});
