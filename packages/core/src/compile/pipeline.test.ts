import { describe, expect, test } from "bun:test";
import { compilePipeline, parsePipeline } from "./pipeline.ts";

describe("parsePipeline", () => {
  describe("invalid YAML", () => {
    test("returns yaml-parse error for malformed YAML", () => {
      // Two lines with mismatched indentation triggers a YAML parse error
      const result = parsePipeline("foo: 1\n  bar: 2");
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toStartWith("yaml parse error:");
    });
  });

  describe("empty / null source", () => {
    test("rejects empty string", () => {
      const result = parsePipeline("");
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("pipeline.yml is empty or null");
    });

    test("rejects null (explicit ~)", () => {
      // yaml.parse("~") === null in YAML 1.1 / yaml spec
      const result = parsePipeline("~\n");
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("pipeline.yml is empty or null");
    });

    test("rejects top-level array", () => {
      const result = parsePipeline("- phase1\n- phase2");
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline.yml must be a YAML mapping at the top level",
      );
    });

    test("rejects top-level scalar", () => {
      const result = parsePipeline("just a string");
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline.yml must be a YAML mapping at the top level",
      );
    });
  });

  describe("unknown top-level fields", () => {
    test("returns error for unknown top-level key", () => {
      const yaml = "pipeline:\n  - agent: test\nunknownField: true";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("unknown top-level field: unknownField");
    });

    test("collects multiple unknown fields in one error list", () => {
      const yaml = "pipeline:\n  - agent: test\nfoo: 1\nbar: 2";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("unknown top-level field: foo");
      expect(result.errors).toContain("unknown top-level field: bar");
    });
  });

  describe("required pipeline field", () => {
    test("returns error when pipeline key is missing", () => {
      const yaml = "finalizer:\n  - cleanup";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("pipeline field is required");
    });

    test("returns error when pipeline is an empty array", () => {
      const result = parsePipeline("pipeline: []");
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("pipeline: must contain at least one phase");
    });

    test("returns error when pipeline is not an array", () => {
      const result = parsePipeline("pipeline: 'not an array'");
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline: expected an array of phase objects",
      );
    });
  });

  describe("phase validation", () => {
    test("returns error when phase is missing agent", () => {
      const yaml = "pipeline:\n  - repeat: 3";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline[0].agent: required, must be a non-empty string",
      );
    });

    test("returns error when phase agent is empty string", () => {
      const yaml = "pipeline:\n  - agent: ''";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline[0].agent: required, must be a non-empty string",
      );
    });

    test("returns error when repeat is not a positive integer", () => {
      // Two phases: first valid, second with repeat: 0
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    repeat: 0";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline[1].repeat: must be a positive integer",
      );
    });

    test("returns error when repeat is a float", () => {
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    repeat: 1.5";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline[1].repeat: must be a positive integer",
      );
    });

    test("returns error when timeout is not a string", () => {
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    timeout: 123";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        'pipeline[1].timeout: must be a string like "30m" or "2h"',
      );
    });

    test("returns error when model is an empty string", () => {
      const yaml = "pipeline:\n  - agent: build\n  - agent: test\n    model: ''";
      const result = parsePipeline(yaml);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "pipeline[1].model: must be a non-empty string",
      );
    });
  });

  describe("valid pipeline", () => {
    test("parses minimal phase", () => {
      const result = parsePipeline("pipeline:\n  - agent: build");
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
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
      expect(result.ok).toBe(true);
      expect(result.value!.pipeline[0]).toEqual({
        agent: "review",
        repeat: 3,
        onFailure: { type: "retry" },
        provider: "opencode",
        model: "gpt-4",
        reasoning: "high",
        timeout: "2h",
      });
    });

    test("parses finalizer", () => {
      const result = parsePipeline(
        "pipeline:\n  - agent: build\nfinalizer:\n  - cleanup",
      );
      expect(result.ok).toBe(true);
      expect(result.value!.finalizer).toEqual(["cleanup"]);
    });

    test("parses triggers", () => {
      const result = parsePipeline(
        "pipeline:\n  - agent: build\ntriggers:\n  push: main",
      );
      expect(result.ok).toBe(true);
      expect(result.value!.triggers).toEqual({ push: "main" });
    });

    test("parses multiple phases", () => {
      const result = parsePipeline(
        "pipeline:\n  - agent: build\n  - agent: test",
      );
      expect(result.ok).toBe(true);
      expect(result.value!.pipeline).toHaveLength(2);
      expect(result.value!.pipeline[0]!.agent).toBe("build");
      expect(result.value!.pipeline[1]!.agent).toBe("test");
    });
  });
});

describe("compilePipeline", () => {
  test("single phase expands to one cycle entry with PROMPT convention", () => {
    const config = { pipeline: [{ agent: "build" }] };
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
    const config = { pipeline: [{ agent: "build" }, { agent: "test" }, { agent: "deploy" }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual([
      "PROMPT_build.md",
      "PROMPT_test.md",
      "PROMPT_deploy.md",
    ]);
  });

  test("repeat: N expands to N entries in the cycle", () => {
    const config = { pipeline: [{ agent: "lint", repeat: 3 }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual([
      "PROMPT_lint.md",
      "PROMPT_lint.md",
      "PROMPT_lint.md",
    ]);
  });

  test("repeat: 1 still produces exactly one entry", () => {
    const config = { pipeline: [{ agent: "build", repeat: 1 }] };
    const plan = compilePipeline(config);
    expect(plan.cycle).toEqual(["PROMPT_build.md"]);
  });

  test("onFailure: retry emits a retry transition at the correct cycle position", () => {
    const config = {
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
    const config = {
      pipeline: [
        { agent: "build" },
        { agent: "test", onFailure: { type: "goto", target: "build" } },
      ],
    };
    const plan = compilePipeline(config);
    expect(plan.transitions).toEqual({ "1": { type: "goto", target: "build" } });
  });

  test("onFailure on a repeated phase attaches transition to every position it occupies", () => {
    const config = {
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

  test("passes finalizer through to LoopPlan", () => {
    const config = {
      pipeline: [{ agent: "build" }],
      finalizer: ["cleanup", "notify"],
    };
    const plan = compilePipeline(config);
    expect(plan.finalizer).toEqual(["cleanup", "notify"]);
  });

  test("passes triggers through to LoopPlan", () => {
    const config = {
      pipeline: [{ agent: "build" }],
      triggers: { push: "main", PR: "develop" },
    };
    const plan = compilePipeline(config);
    expect(plan.triggers).toEqual({ push: "main", PR: "develop" });
  });

  test("defaults finalizer to [] and triggers to {}", () => {
    const config = { pipeline: [{ agent: "build" }] };
    const plan = compilePipeline(config);
    expect(plan.finalizer).toEqual([]);
    expect(plan.triggers).toEqual({});
  });

  test("ignored fields (provider, model, reasoning, timeout) do not appear in cycle", () => {
    const config = {
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
    const config = {
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
});
