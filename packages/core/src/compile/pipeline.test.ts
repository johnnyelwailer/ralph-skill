import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compilePipeline, loadPipelineFromFile, parsePipeline } from "./pipeline.ts";

describe("parsePipeline", () => {
  test("parses a minimal valid pipeline", () => {
    const yaml = `
pipeline:
  - agent: plan
  - agent: build
    repeat: 3
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline.length).toBe(2);
      expect(result.value.pipeline[0]!.agent).toBe("plan");
      expect(result.value.pipeline[1]!.agent).toBe("build");
      expect(result.value.pipeline[1]!.repeat).toBe(3);
    }
  });

  test("parses finalizer as array of prompt filenames", () => {
    const yaml = `
pipeline:
  - agent: plan
finalizer:
  - PROMPT_spec-gap.md
  - PROMPT_docs.md
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.finalizer).toEqual(["PROMPT_spec-gap.md", "PROMPT_docs.md"]);
    }
  });

  test("parses triggers as name → prompt map", () => {
    const yaml = `
pipeline:
  - agent: plan
triggers:
  merge_conflict: PROMPT_merge.md
  stuck_detected: PROMPT_debug.md
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.triggers).toEqual({
        merge_conflict: "PROMPT_merge.md",
        stuck_detected: "PROMPT_debug.md",
      });
    }
  });

  test("parses onFailure: retry keyword", () => {
    const yaml = `
pipeline:
  - agent: build
    onFailure: retry
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline[0]!.onFailure).toEqual({ type: "retry" });
    }
  });

  test("parses onFailure: goto <agent> keyword", () => {
    const yaml = `
pipeline:
  - agent: review
    onFailure: goto build
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline[0]!.onFailure).toEqual({ type: "goto", target: "build" });
    }
  });

  test("parses provider as single string", () => {
    const yaml = `
pipeline:
  - agent: build
    provider: opencode
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline[0]!.provider).toBe("opencode");
    }
  });

  test("parses provider as ordered chain", () => {
    const yaml = `
pipeline:
  - agent: build
    provider: [opencode, copilot, codex, gemini, claude]
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline[0]!.provider).toEqual([
        "opencode",
        "copilot",
        "codex",
        "gemini",
        "claude",
      ]);
    }
  });

  test("rejects chain longer than 10 entries", () => {
    const yaml = `
pipeline:
  - agent: build
    provider: [a, b, c, d, e, f, g, h, i, j, k]
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("chain length"))).toBe(true);
    }
  });

  test("rejects missing agent field with path-qualified error", () => {
    const yaml = `
pipeline:
  - agent: plan
  - repeat: 5
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("pipeline[1].agent"))).toBe(true);
    }
  });

  test("rejects unknown top-level key fail-loud", () => {
    const yaml = `
pipeline:
  - agent: plan
nonsense: true
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("unknown top-level field: nonsense"))).toBe(true);
    }
  });

  test("rejects invalid YAML with clean error", () => {
    const result = parsePipeline("pipeline:\n  - agent: plan\n  bad: [");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("yaml parse error");
    }
  });

  test("rejects reasoning enum violations", () => {
    const yaml = `
pipeline:
  - agent: review
    reasoning: bogus
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("reasoning"))).toBe(true);
    }
  });

  test("rejects non-integer repeat", () => {
    const yaml = `
pipeline:
  - agent: build
    repeat: 2.5
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
  });

  test("rejects unknown onFailure keyword", () => {
    const yaml = `
pipeline:
  - agent: build
    onFailure: panic
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
  });

  test("rejects empty pipeline array", () => {
    const yaml = `
pipeline: []
`;
    const result = parsePipeline(yaml);
    expect(result.ok).toBe(false);
  });
});

describe("compilePipeline", () => {
  test("expands repeat into flat cycle", () => {
    const plan = compilePipeline({
      pipeline: [
        { agent: "plan" },
        { agent: "build", repeat: 3 },
        { agent: "review" },
      ],
    });
    expect(plan.cycle).toEqual([
      "PROMPT_plan.md",
      "PROMPT_build.md",
      "PROMPT_build.md",
      "PROMPT_build.md",
      "PROMPT_review.md",
    ]);
    expect(plan.cyclePosition).toBe(0);
    expect(plan.iteration).toBe(1);
    expect(plan.version).toBe(1);
    expect(plan._v).toBe(1);
  });

  test("records transitions keyed by cycle position", () => {
    const plan = compilePipeline({
      pipeline: [
        { agent: "plan" },
        { agent: "build", repeat: 2, onFailure: { type: "retry" } },
        { agent: "review", onFailure: { type: "goto", target: "build" } },
      ],
    });
    // Positions 1 and 2 are build copies, both get retry
    expect(plan.transitions["1"]).toEqual({ type: "retry" });
    expect(plan.transitions["2"]).toEqual({ type: "retry" });
    // Position 3 is review, goto build
    expect(plan.transitions["3"]).toEqual({ type: "goto", target: "build" });
    // Position 0 (plan) has no transition
    expect(plan.transitions["0"]).toBeUndefined();
  });

  test("preserves finalizer array as provided", () => {
    const plan = compilePipeline({
      pipeline: [{ agent: "plan" }],
      finalizer: ["PROMPT_spec-gap.md", "PROMPT_proof.md"],
    });
    expect(plan.finalizer).toEqual(["PROMPT_spec-gap.md", "PROMPT_proof.md"]);
  });

  test("preserves triggers map", () => {
    const plan = compilePipeline({
      pipeline: [{ agent: "plan" }],
      triggers: { merge_conflict: "PROMPT_merge.md" },
    });
    expect(plan.triggers).toEqual({ merge_conflict: "PROMPT_merge.md" });
  });

  test("empty-ish config still produces valid plan scaffolding", () => {
    const plan = compilePipeline({ pipeline: [{ agent: "plan" }] });
    expect(plan.finalizer).toEqual([]);
    expect(plan.triggers).toEqual({});
    expect(plan.allTasksMarkedDone).toBe(false);
    expect(plan.finalizerPosition).toBe(0);
  });
});

describe("loadPipelineFromFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pipeline-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("loads and parses a real file", () => {
    const path = join(dir, "pipeline.yml");
    writeFileSync(path, "pipeline:\n  - agent: plan\n  - agent: build\n    repeat: 5\n");
    const result = loadPipelineFromFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline.length).toBe(2);
    }
  });

  test("returns ParseResult failure when file is missing", () => {
    const result = loadPipelineFromFile(join(dir, "does-not-exist.yml"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("cannot read");
    }
  });
});
