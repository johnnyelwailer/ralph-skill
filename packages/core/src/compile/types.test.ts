import { describe, expect, test } from "bun:test";
import type {
  LoopPlan,
  ParseResult,
  PipelineConfig,
  PipelinePhase,
  ProviderRef,
  TransitionKeyword,
} from "./types.ts";

// ─── ProviderRef ─────────────────────────────────────────────────────────────

describe("ProviderRef", () => {
  test("accepts a plain string", () => {
    const ref: ProviderRef = "opencode";
    expect(ref).toBe("opencode");
  });

  test("accepts a readonly array of strings", () => {
    const ref: ProviderRef = ["opencode", "claude/opus"] as const;
    expect(ref).toEqual(["opencode", "claude/opus"]);
  });
});

// ─── TransitionKeyword ───────────────────────────────────────────────────────

describe("TransitionKeyword", () => {
  test("retry variant has only type field", () => {
    const kw: TransitionKeyword = { type: "retry" };
    expect(kw.type).toBe("retry");
    expect((kw as { target?: string }).target).toBeUndefined();
  });

  test("goto variant has type and target", () => {
    const kw: TransitionKeyword = { type: "goto", target: "finalize" };
    expect(kw.type).toBe("goto");
    expect(kw.target).toBe("finalize");
  });

  test("discriminated union narrowing: switch on type", () => {
    function getTarget(kw: TransitionKeyword): string | undefined {
      if (kw.type === "goto") return kw.target;
      return undefined;
    }
    expect(getTarget({ type: "retry" })).toBeUndefined();
    expect(getTarget({ type: "goto", target: "step_2" })).toBe("step_2");
  });
});

// ─── PipelinePhase ──────────────────────────────────────────────────────────

describe("PipelinePhase", () => {
  test("minimal phase requires only agent", () => {
    const phase: PipelinePhase = { agent: "build" };
    expect(phase.agent).toBe("build");
    expect(phase.provider).toBeUndefined();
    expect(phase.repeat).toBeUndefined();
    expect(phase.onFailure).toBeUndefined();
  });

  test("full phase includes all optional fields", () => {
    const phase: PipelinePhase = {
      agent: "review",
      repeat: 3,
      onFailure: { type: "retry" },
      provider: "anthropic/claude-3-5",
      model: "claude-3-5-sonnet",
      reasoning: "high",
      timeout: "5m",
    };
    expect(phase.agent).toBe("review");
    expect(phase.repeat).toBe(3);
    expect(phase.onFailure).toEqual({ type: "retry" });
    expect(phase.provider).toBe("anthropic/claude-3-5");
    expect(phase.model).toBe("claude-3-5-sonnet");
    expect(phase.reasoning).toBe("high");
    expect(phase.timeout).toBe("5m");
  });

  test("reasoning accepts all valid string literals", () => {
    const values: PipelinePhase["reasoning"][] = ["none", "low", "medium", "high", "xhigh"];
    for (const v of values) {
      const phase: PipelinePhase = { agent: "x", reasoning: v };
      expect(phase.reasoning).toBe(v);
    }
  });

  test("timeout is an arbitrary string (duration format)", () => {
    const timeouts: PipelinePhase["timeout"][] = ["30s", "5m", "1h", "1d"];
    for (const t of timeouts) {
      const phase: PipelinePhase = { agent: "x", timeout: t };
      expect(phase.timeout).toBe(t);
    }
  });

  test("provider accepts string or readonly string array", () => {
    const phaseStr: PipelinePhase = { agent: "x", provider: "opencode" };
    const phaseArr: PipelinePhase = { agent: "x", provider: ["opencode", "claude"] };
    expect(phaseStr.provider).toBe("opencode");
    expect(phaseArr.provider).toEqual(["opencode", "claude"]);
  });
});

// ─── PipelineConfig ─────────────────────────────────────────────────────────

describe("PipelineConfig", () => {
  test("minimal config requires only pipeline array", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build" }] };
    expect(config.pipeline).toHaveLength(1);
    expect(config.finalizer).toBeUndefined();
    expect(config.triggers).toBeUndefined();
  });

  test("full config includes finalizer and triggers", () => {
    const config: PipelineConfig = {
      pipeline: [{ agent: "build" }],
      finalizer: ["PROMPT_finalize.md"],
      triggers: { on_push: "build" },
    };
    expect(config.finalizer).toEqual(["PROMPT_finalize.md"]);
    expect(config.triggers).toEqual({ on_push: "build" });
  });

  test("pipeline is readonly at type level", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build" }] };
    // TypeScript enforces readonly — assignment would fail to compile:
    // (config.pipeline as Array<PipelinePhase>).push({ agent: "x" });
    expect(config.pipeline[0]!.agent).toBe("build");
  });

  test("empty pipeline array is valid", () => {
    const config: PipelineConfig = { pipeline: [] };
    expect(config.pipeline).toHaveLength(0);
  });
});

// ─── LoopPlan ───────────────────────────────────────────────────────────────

describe("LoopPlan", () => {
  test("full plan has all required runtime fields", () => {
    const plan: LoopPlan = {
      _v: 1,
      cycle: ["PROMPT_a.md", "PROMPT_b.md"],
      finalizer: ["PROMPT_finalize.md"],
      triggers: { on_push: "build" },
      cyclePosition: 0,
      finalizerPosition: 0,
      iteration: 1,
      allTasksMarkedDone: false,
      version: 1,
      transitions: { "0": { type: "goto", target: "finalize" } },
    };
    expect(plan._v).toBe(1);
    expect(plan.cycle).toEqual(["PROMPT_a.md", "PROMPT_b.md"]);
    expect(plan.cyclePosition).toBe(0);
    expect(plan.iteration).toBe(1);
    expect(plan.allTasksMarkedDone).toBe(false);
    expect(plan.transitions["0"]).toEqual({ type: "goto", target: "finalize" });
  });

  test("minimal plan has all required fields with sensible defaults", () => {
    const plan: LoopPlan = {
      _v: 1,
      cycle: [],
      finalizer: [],
      triggers: {},
      cyclePosition: 0,
      finalizerPosition: 0,
      iteration: 1,
      allTasksMarkedDone: false,
      version: 1,
      transitions: {},
    };
    expect(plan.cycle).toEqual([]);
    expect(plan.finalizer).toEqual([]);
    expect(plan.triggers).toEqual({});
    expect(plan.transitions).toEqual({});
  });

  test("transitions key is string (cyclePosition as string key)", () => {
    const plan: LoopPlan = {
      _v: 1,
      cycle: ["PROMPT_a.md", "PROMPT_b.md", "PROMPT_c.md"],
      finalizer: [],
      triggers: {},
      cyclePosition: 1,
      finalizerPosition: 0,
      iteration: 3,
      allTasksMarkedDone: false,
      version: 1,
      transitions: {
        "0": { type: "goto", target: "finalize" },
        "2": { type: "retry" },
      },
    };
    expect(plan.transitions["0"]).toEqual({ type: "goto", target: "finalize" });
    expect(plan.transitions["2"]).toEqual({ type: "retry" });
    expect(plan.transitions["1"]).toBeUndefined();
  });

  test("allTasksMarkedDone reflects session completion state", () => {
    const running: LoopPlan = {
      _v: 1,
      cycle: ["PROMPT_a.md"],
      finalizer: [],
      triggers: {},
      cyclePosition: 0,
      finalizerPosition: 0,
      iteration: 1,
      allTasksMarkedDone: false,
      version: 1,
      transitions: {},
    };
    const done: LoopPlan = { ...running, allTasksMarkedDone: true };
    expect(running.allTasksMarkedDone).toBe(false);
    expect(done.allTasksMarkedDone).toBe(true);
  });
});

// ─── ParseResult<T> discriminated union ─────────────────────────────────────

describe("ParseResult<T>", () => {
  test("ok=true variant has value and no errors", () => {
    const result: ParseResult<string> = { ok: true, value: "hello" };
    expect(result.ok).toBe(true);
    expect(result.value).toBe("hello");
    expect((result as { errors?: unknown }).errors).toBeUndefined();
  });

  test("ok=false variant has errors and no value", () => {
    const result: ParseResult<string> = {
      ok: false,
      errors: ["field x is required", "field y must be a string"],
    };
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect((result as { value?: unknown }).value).toBeUndefined();
  });

  test("narrowing: check ok before accessing value", () => {
    function getValue(result: ParseResult<string>): string | undefined {
      if (result.ok) return result.value;
      return undefined;
    }
    expect(getValue({ ok: true, value: "hello" })).toBe("hello");
    expect(getValue({ ok: false, errors: [] })).toBeUndefined();
  });

  test("narrowing: check ok before accessing errors", () => {
    function getErrors(result: ParseResult<string>): readonly string[] | undefined {
      if (!result.ok) return result.errors;
      return undefined;
    }
    expect(getErrors({ ok: false, errors: ["oops"] })).toEqual(["oops"]);
    expect(getErrors({ ok: true, value: "hi" })).toBeUndefined();
  });

  test("errors array is readonly", () => {
    const result: ParseResult<string> = { ok: false, errors: ["single error"] };
    // TypeScript enforces readonly — mutation would fail to compile:
    // (result.errors as string[]).push("another");
    expect(result.errors[0]).toBe("single error");
  });

  test("ParseResult<PipelineConfig> ok variant carries PipelineConfig value", () => {
    const config: PipelineConfig = { pipeline: [{ agent: "build" }] };
    const result: ParseResult<PipelineConfig> = { ok: true, value: config };
    if (result.ok) {
      expect(result.value.pipeline[0]!.agent).toBe("build");
    }
  });

  test("ParseResult<PipelineConfig> error variant carries string errors", () => {
    const result: ParseResult<PipelineConfig> = {
      ok: false,
      errors: [
        "pipeline field is required",
        "yaml parse error: unexpected token",
        "unknown top-level field: nope",
      ],
    };
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain("pipeline field is required");
    }
  });

  test("empty errors array is allowed on ok=false", () => {
    // Edge case: a parser may return no errors but still mark ok=false (e.g., validation suppressed)
    const result: ParseResult<string> = { ok: false, errors: [] };
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(0);
  });
});
