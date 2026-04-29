import { describe, expect, test } from "bun:test";
import { compilePipeline, loadPipelineFromFile, parsePipeline } from "./pipeline.ts";
import type { PipelineConfig } from "./types.ts";

type PipelineParseResult = ReturnType<typeof parsePipeline>;

function expectParseOk(result: PipelineParseResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected parse success, got: ${result.errors.join("; ")}`);
  return result.value;
}

function expectParseErrors(result: PipelineParseResult) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parse failure");
  return result.errors;
}

describe("parsePipeline", () => {
  describe("invalid YAML", () => {
    test("returns yaml-parse error for malformed YAML", () => {
      // Two lines with mismatched indentation triggers a YAML parse error
      const result = parsePipeline("foo: 1\n  bar: 2");
      const errors = expectParseErrors(result);
      expect(errors[0]).toStartWith("yaml parse error:");
    });
  });

  describe("empty / null source", () => {
    test("rejects empty string", () => {
      const result = parsePipeline("");
      const errors = expectParseErrors(result);
      expect(errors).toContain("pipeline.yml is empty or null");
    });

    test("rejects null (explicit ~)", () => {
      // yaml.parse("~") === null in YAML 1.1 / yaml spec
      const result = parsePipeline("~\n");
      const errors = expectParseErrors(result);
      expect(errors).toContain("pipeline.yml is empty or null");
    });

    test("rejects top-level array", () => {
      const result = parsePipeline("- phase1\n- phase2");
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline.yml must be a YAML mapping at the top level",
      );
    });

    test("rejects top-level scalar", () => {
      const result = parsePipeline("just a string");
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline.yml must be a YAML mapping at the top level",
      );
    });
  });

  describe("unknown top-level fields", () => {
    test("returns error for unknown top-level key", () => {
      const yaml = "pipeline:\n  - agent: test\nunknownField: true";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain("unknown top-level field: unknownField");
    });

    test("collects multiple unknown fields in one error list", () => {
      const yaml = "pipeline:\n  - agent: test\nfoo: 1\nbar: 2";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain("unknown top-level field: foo");
      expect(errors).toContain("unknown top-level field: bar");
    });
  });

  describe("required pipeline field", () => {
    test("returns error when pipeline key is missing", () => {
      const yaml = "finalizer:\n  - agent: cleanup";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain("pipeline field is required");
    });

    test("returns error when pipeline is an empty array", () => {
      const result = parsePipeline("pipeline: []");
      const errors = expectParseErrors(result);
      expect(errors).toContain("pipeline: must contain at least one phase");
    });

    test("returns error when pipeline is not an array", () => {
      const result = parsePipeline("pipeline: 'not an array'");
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline: expected an array of phase objects",
      );
    });
  });

  describe("phase validation", () => {
    test("returns error when phase is missing agent", () => {
      const yaml = "pipeline:\n  - repeat: 3";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline[0].agent: required, must be a non-empty string",
      );
    });

    test("returns error when phase agent is empty string", () => {
      const yaml = "pipeline:\n  - agent: ''";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline[0].agent: required, must be a non-empty string",
      );
    });

    test("returns error when repeat is not a positive integer", () => {
      // Two phases: first valid, second with repeat: 0
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    repeat: 0";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline[1].repeat: must be a positive integer",
      );
    });

    test("returns error when repeat is a float", () => {
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    repeat: 1.5";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline[1].repeat: must be a positive integer",
      );
    });

    test("returns error when timeout is not a string", () => {
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    timeout: 123";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        'pipeline[1].timeout: must be a string like "30m" or "2h"',
      );
    });

    test("returns error when model is an empty string", () => {
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    model: ''";
      const result = parsePipeline(yaml);
      const errors = expectParseErrors(result);
      expect(errors).toContain(
        "pipeline[1].model: must be a non-empty string",
      );
    });
  });

  describe("valid pipeline", () => {
    test("parses minimal phase", () => {
      const result = parsePipeline("pipeline:\n  - agent: build");
      const parsed = expectParseOk(result);
      expect(parsed).toEqual({
        pipeline: [{ agent: "build" }],
      });
    });

    test("parses phase with all optional fields", () => {
      const result = parsePipeline(
        `pipeline:
  - agent: review
    repeat: 3
    onFailure: retry
    provider: opencode
    model: gpt-4
    reasoning: high
    timeout: 2h`,
      );
      const parsed = expectParseOk(result);
      expect(parsed.pipeline[0]).toEqual({
        agent: "review",
        repeat: 3,
        onFailure: { type: "retry" },
        provider: "opencode",
        model: "gpt-4",
        reasoning: "high",
        timeout: "2h",
      });
    });

    test("parses finalizer with full phase objects", () => {
      const result = parsePipeline(
        `pipeline:
  - agent: build
finalizer:
  - agent: spec-gap
  - agent: docs
    provider: claude
    reasoning: high
  - agent: proof`,
      );
      const parsed = expectParseOk(result);
      expect(parsed.finalizer).toEqual([
        { agent: "spec-gap" },
        { agent: "docs", provider: "claude", reasoning: "high" },
        { agent: "proof" },
      ]);
    });

    test("parses triggers", () => {
      const result = parsePipeline(
        "pipeline:\n  - agent: build\ntriggers:\n  push: main",
      );
      const parsed = expectParseOk(result);
      expect(parsed.triggers).toEqual({ push: "main" });
    });

    test("parses multiple phases", () => {
      const result = parsePipeline(
        "pipeline:\n  - agent: build\n  - agent: test",
      );
      const parsed = expectParseOk(result);
      expect(parsed.pipeline).toHaveLength(2);
      expect(parsed.pipeline[0]!.agent).toBe("build");
      expect(parsed.pipeline[1]!.agent).toBe("test");
    });
  });
});

describe("compilePipeline", () => {
  test("single phase expands to one cycle entry with PROMPT convention", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build" }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual(["PROMPT_build.md"]);
    expect(plan.finalizer).toEqual([]);
    expect(plan.triggers).toEqual({});
    expect(plan.cyclePosition).toBe(0);
    expect(plan.iteration).toBe(1);
    expect(plan.allTasksMarkedDone).toBe(false);
    expect(plan.version).toBe(1);
    expect(plan.transitions).toEqual({});
  });

  test("multiple phases produce multiple cycle entries", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build" }, { agent: "test" }, { agent: "deploy" }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual([
      "PROMPT_build.md",
      "PROMPT_test.md",
      "PROMPT_deploy.md",
    ]);
  });

  test("repeat: N expands to N entries in the cycle", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "lint", repeat: 3 }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual([
      "PROMPT_lint.md",
      "PROMPT_lint.md",
      "PROMPT_lint.md",
    ]);
  });

  test("repeat: 1 still produces exactly one entry", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build", repeat: 1 }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual(["PROMPT_build.md"]);
  });

  test("onFailure: retry emits a retry transition at the correct cycle position", () => {
    const config: PipelineConfig = {
      pipeline: [
        { agent: "build" },
        { agent: "test", onFailure: { type: "retry" } },
      ],
    };
    const plan = compilePipeline(config);
    // test is at cycle position 1
    expect(plan.transitions).toEqual({ "1": { type: "retry" } });
  });

  test("onFailure: goto <agent> emits a goto transition", () => {
    const config: PipelineConfig = {
      pipeline: [
        { agent: "build" },
        { agent: "test", onFailure: { type: "goto", target: "build" } },
      ],
    };
    const plan = compilePipeline(config);
    expect(plan.transitions).toEqual({ "1": { type: "goto", target: "build" } });
  });

  test("onFailure on a repeated phase attaches transition to every position it occupies", () => {
    const config: PipelineConfig = {
      pipeline: [{ agent: "build", repeat: 3, onFailure: { type: "retry" } }],
    };
    const plan = compilePipeline(config);
    // build occupies positions 0, 1, 2; each gets the transition
    expect(plan.cycle).toEqual([
      "PROMPT_build.md",
      "PROMPT_build.md",
      "PROMPT_build.md",
    ]);
    expect(plan.transitions).toEqual({
      "0": { type: "retry" },
      "1": { type: "retry" },
      "2": { type: "retry" },
    });
  });

  test("passes finalizer through to LoopPlan as compiled PROMPT filenames", () => {
    const config: PipelineConfig = {
      pipeline: [{ agent: "build" }],
      finalizer: [
        { agent: "spec-gap" },
        { agent: "docs" },
      ],
    };
    const plan = compilePipeline(config);
    expect(plan.finalizer).toEqual(["PROMPT_spec-gap.md", "PROMPT_docs.md"]);
  });

  test("finalizer phases compile provider and reasoning are ignored (not in loop-plan)", () => {
    // Finalizer phases support the same fields as pipeline phases for parsing,
    // but compilePipeline only extracts the agent name for the PROMPT convention.
    const config: PipelineConfig = {
      pipeline: [{ agent: "build" }],
      finalizer: [
        { agent: "proof", provider: "claude", reasoning: "high", timeout: "30m" },
      ],
    };
    const plan = compilePipeline(config);
    expect(plan.finalizer).toEqual(["PROMPT_proof.md"]);
  });

  test("passes triggers through to LoopPlan", () => {
    const config: PipelineConfig = {
      pipeline: [{ agent: "build" }],
      triggers: { push: "main", PR: "develop" },
    };
    const plan = compilePipeline(config);
    expect(plan.triggers).toEqual({ push: "main", PR: "develop" });
  });

  test("defaults finalizer to [] and triggers to {}", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build" }] };
    const plan = compilePipeline(config);
    expect(plan.finalizer).toEqual([]);
    expect(plan.triggers).toEqual({});
  });

  test("ignored fields (provider, model, reasoning, timeout) do not appear in cycle", () => {
    const config: PipelineConfig = {
      pipeline: [
        {
          agent: "review",
          provider: "claude",
          model: "claude-opus",
          reasoning: "high" as const,
          timeout: "1h",
        },
      ],
    };
    const plan = compilePipeline(config);
    // Cycle should only contain the prompt filename
    expect(plan.cycle).toEqual(["PROMPT_review.md"]);
    expect(plan.transitions).toEqual({});
  });

  test("transition keys are always string (cyclePosition is not serialized as number key)", () => {
    const config: PipelineConfig = {
      pipeline: [
        { agent: "a" },
        { agent: "b", onFailure: { type: "retry" } },
        { agent: "c", onFailure: { type: "goto", target: "a" } },
      ],
    };
    const plan = compilePipeline(config);
    const keys = Object.keys(plan.transitions);
    expect(keys).toEqual(["1", "2"]);
    expect(keys.every((k) => typeof k === "string")).toBe(true);
  });

  test("compilePipeline always sets LoopPlan runtime fields to their initial values", () => {
    // A complex config to prove these fields are not derived from config content
    const config: PipelineConfig = {
      pipeline: [{ agent: "build", repeat: 2 }],
      finalizer: [{ agent: "proof" }],
      triggers: { push: "main" },
    };
    const plan = compilePipeline(config);
    // cyclePosition — starts at 0, not derived from repeat count
    expect(plan.cyclePosition).toBe(0);
    // finalizerPosition — always 0 at plan creation
    expect(plan.finalizerPosition).toBe(0);
    // iteration — always 1 at plan creation; runtime advances it
    expect(plan.iteration).toBe(1);
    // allTasksMarkedDone — always false at plan creation; runtime sets true
    expect(plan.allTasksMarkedDone).toBe(false);
    // version — always 1 for v1 schema
    expect(plan.version).toBe(1);
    // _v — schema version marker
    expect(plan._v).toBe(1);
  });

  test("finalizerPosition is 0 even when finalizer array is non-empty", () => {
    // finalizerPosition tracks position within the finalizer array during
    // execution — it starts at 0 regardless of how many finalizer steps exist
    const config: PipelineConfig = {
      pipeline: [{ agent: "build" }],
      finalizer: [
        { agent: "spec-gap" },
        { agent: "docs" },
        { agent: "proof" },
      ],
    };
    const plan = compilePipeline(config);
    expect(plan.finalizer).toEqual([
      "PROMPT_spec-gap.md",
      "PROMPT_docs.md",
      "PROMPT_proof.md",
    ]);
    expect(plan.finalizerPosition).toBe(0);
  });

  test("iteration is 1 for a pipeline with multiple phases and repeats", () => {
    // iteration is a runtime counter; compilePipeline always initializes to 1
    const config: PipelineConfig = {
      pipeline: [
        { agent: "build", repeat: 3 },
        { agent: "test", repeat: 2 },
      ],
    };
    const plan = compilePipeline(config);
    expect(plan.cycle).toHaveLength(5);
    expect(plan.iteration).toBe(1);
  });
});

describe("loadPipelineFromFile", () => {
  test("returns ok=true with parsed config for a valid pipeline file", () => {
    const result = loadPipelineFromFile(
      new URL("./testdata/valid-pipeline.yml", import.meta.url).pathname,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pipeline).toHaveLength(1);
      expect(result.value.pipeline[0]!.agent).toBe("build");
    }
  });

  test("returns ok=false with ENOENT error when file does not exist", () => {
    const result = loadPipelineFromFile("/nonexistent/path/to/pipeline.yml");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!).toContain("cannot read pipeline file");
      expect(result.errors[0]!).toContain("ENOENT");
    }
  });

  test("returns ok=false when file contains invalid YAML", async () => {
    // Write a temp file with malformed YAML
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tmpFile = join("/tmp", `aloop-test-invalid-${Date.now()}.yml`);
    writeFileSync(tmpFile, "invalid: yaml: content:\n  bad: indentation");
    const result = loadPipelineFromFile(tmpFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!).toStartWith("yaml parse error:");
    }
    unlinkSync(tmpFile);
  });

  test("loadPipelineFromFile result can be passed to compilePipeline", () => {
    const parsed = loadPipelineFromFile(
      new URL("./testdata/valid-pipeline.yml", import.meta.url).pathname,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const plan = compilePipeline(parsed.value);
      expect(plan.cycle).toHaveLength(1);
      expect(plan.cycle[0]!).toBe("PROMPT_build.md");
    }
  });
});
