import { describe, expect, test } from "bun:test";
import { normalizeLimitsPatch } from "./limits-patch.ts";

describe("normalizeLimitsPatch", () => {
  test("accepts snake_case and camelCase top-level fields", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { concurrency_cap: 5, permitTtlDefaultSeconds: 300 },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.concurrencyCap).toBe(5);
    expect(patch.permitTtlDefaultSeconds).toBe(300);
  });

  test("accepts nested system_limits cpu/mem/load fields with both naming conventions", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { system_limits: { cpu_max_pct: 75, memMaxPct: 90 } },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.cpuMaxPct).toBe(75);
    expect(patch.memMaxPct).toBe(90);
  });

  test("accepts nested burn_rate fields with both naming conventions", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { burn_rate: { min_commits_per_hour: 3, maxTokensSinceCommit: 500_000 } },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.minCommitsPerHour).toBe(3);
    expect(patch.maxTokensSinceCommit).toBe(500_000);
  });

  test("top-level cpu_max_pct is read first; nested system_limits cpu_max_pct is ignored when top-level is set", () => {
    // The code picks top-level first, then only fills from nested if top-level is undefined.
    // So when top-level cpu_max_pct is set, the nested value is shadowed.
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      {
        cpu_max_pct: 60,
        system_limits: { cpu_max_pct: 85 },
      },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.cpuMaxPct).toBe(60); // top-level wins
  });

  test("top-level min_commits_per_hour is NOT allowed; must use nested burn_rate", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ min_commits_per_hour: 5 }, errors);
    expect(errors).toContain("unknown scheduler limits field: min_commits_per_hour");
  });

  test("top-level max_tokens_since_commit is NOT allowed; must use nested burn_rate", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ max_tokens_since_commit: 500_000 }, errors);
    expect(errors).toContain("unknown scheduler limits field: max_tokens_since_commit");
  });

  test("rejects unknown top-level fields", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ nope: 1, "also.unknown": true }, errors);
    expect(errors).toContain("unknown scheduler limits field: nope");
    expect(errors).toContain("unknown scheduler limits field: also.unknown");
  });

  test("rejects unknown system_limits nested fields", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ system_limits: { nope: 1 } }, errors);
    expect(errors).toContain("unknown scheduler.system_limits field: nope");
  });

  test("rejects unknown burn_rate nested fields", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ burn_rate: { nope: 1 } }, errors);
    expect(errors).toContain("unknown scheduler.burn_rate field: nope");
  });

  test("rejects system_limits when it is not a mapping", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ system_limits: "not-a-map" }, errors);
    expect(errors).toContain("scheduler.system_limits: must be a mapping");
  });

  test("rejects burn_rate when it is not a mapping", () => {
    const errors: string[] = [];
    normalizeLimitsPatch({ burn_rate: 42 }, errors);
    expect(errors).toContain("scheduler.burn_rate: must be a mapping");
  });

  test("when top-level unknown field exists, returns empty patch without validating nested fields", () => {
    // Top-level unknown field causes early return with empty patch.
    // Nested unknown fields are NOT reported because nested validation
    // only runs when top-level passes (no errors).
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { nope: 1, system_limits: { also_nope: 2 } },
      errors,
    );
    expect(errors).toContain("unknown scheduler limits field: nope");
    // Nested validation did NOT run, so no "also_nope" error
    expect(patch.concurrencyCap).toBeUndefined();
  });

  test("returns empty patch on top-level error (partial results not included)", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ nope: 1, concurrency_cap: 5 }, errors);
    expect(patch.concurrencyCap).toBeUndefined();
  });

  test("accepts all valid top-level scalar fields", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      {
        concurrency_cap: 1,
        permit_ttl_default_seconds: 2,
        permit_ttl_max_seconds: 3,
        cpu_max_pct: 4,
        mem_max_pct: 5,
        load_max: 6,
      },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.concurrencyCap).toBe(1);
    expect(patch.permitTtlDefaultSeconds).toBe(2);
    expect(patch.permitTtlMaxSeconds).toBe(3);
    expect(patch.cpuMaxPct).toBe(4);
    expect(patch.memMaxPct).toBe(5);
    expect(patch.loadMax).toBe(6);
  });

  test("accepts mixed snake and camel top-level fields simultaneously", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      {
        concurrencyCap: 10,
        permit_ttl_max_seconds: 100,
        cpuMaxPct: 50,
      },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.concurrencyCap).toBe(10);
    expect(patch.permitTtlMaxSeconds).toBe(100);
    expect(patch.cpuMaxPct).toBe(50);
  });

  test("accepts empty nested system_limits ({}) without error", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ system_limits: {} }, errors);
    expect(errors).toEqual([]);
    expect(patch.cpuMaxPct).toBeUndefined();
    expect(patch.memMaxPct).toBeUndefined();
    expect(patch.loadMax).toBeUndefined();
  });

  test("accepts empty nested burn_rate ({}) without error", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ burn_rate: {} }, errors);
    expect(errors).toEqual([]);
    expect(patch.minCommitsPerHour).toBeUndefined();
    expect(patch.maxTokensSinceCommit).toBeUndefined();
  });

  test("accepts mixed snake and camel keys within the same nested system_limits object", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { system_limits: { cpu_max_pct: 70, memMaxPct: 85, load_max: 3.5 } },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.cpuMaxPct).toBe(70);
    expect(patch.memMaxPct).toBe(85);
    expect(patch.loadMax).toBe(3.5);
  });

  test("accepts mixed snake and camel keys within the same nested burn_rate object", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { burn_rate: { min_commits_per_hour: 2, maxTokensSinceCommit: 1_000_000 } },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.minCommitsPerHour).toBe(2);
    expect(patch.maxTokensSinceCommit).toBe(1_000_000);
  });

  test("burn_rate as top-level object (not map) returns error: must be a mapping", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ burn_rate: 42 }, errors);
    expect(errors).toContain("scheduler.burn_rate: must be a mapping");
    expect(patch.maxTokensSinceCommit).toBeUndefined();
    expect(patch.minCommitsPerHour).toBeUndefined();
  });

  test("system_limits as top-level string returns error: must be a mapping", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ system_limits: "not-a-map" }, errors);
    expect(errors).toContain("scheduler.system_limits: must be a mapping");
    expect(patch.cpuMaxPct).toBeUndefined();
  });

  test("burn_rate: null is rejected as non-map", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ burn_rate: null }, errors);
    expect(errors).toContain("scheduler.burn_rate: must be a mapping");
    expect(patch.maxTokensSinceCommit).toBeUndefined();
  });

  test("system_limits: null is rejected as non-map", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ system_limits: null }, errors);
    expect(errors).toContain("scheduler.system_limits: must be a mapping");
    expect(patch.cpuMaxPct).toBeUndefined();
  });

  test("burn_rate: [] is rejected as non-map", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ burn_rate: [] }, errors);
    expect(errors).toContain("scheduler.burn_rate: must be a mapping");
  });

  test("system_limits: [] is rejected as non-map", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({ system_limits: [] }, errors);
    expect(errors).toContain("scheduler.system_limits: must be a mapping");
  });

  test("top-level burn_rate object shadows its own nested burn_rate.min_commits_per_hour key", () => {
    // When burn_rate is an object at top level, isMap(burnRate) is true,
    // so nested extraction runs and picks from the object.
    // Top-level burn_rate value (an object) is NOT picked by pick() for min_commits_per_hour
    // because pick() reads rawPatch directly, not the parsed burnRate variable.
    // The nested burn_rate object values are correctly picked.
    const errors: string[] = [];
    const patch = normalizeLimitsPatch(
      { burn_rate: { min_commits_per_hour: 3, maxTokensSinceCommit: 500_000 } },
      errors,
    );
    expect(errors).toEqual([]);
    expect(patch.minCommitsPerHour).toBe(3);
    expect(patch.maxTokensSinceCommit).toBe(500_000);
  });

  test("empty patch {} is accepted and produces all-undefined patch values (no errors)", () => {
    const errors: string[] = [];
    const patch = normalizeLimitsPatch({}, errors);
    expect(errors).toEqual([]);
    // All values must be undefined (the keys are typed fields but values are absent)
    expect(patch.concurrencyCap).toBeUndefined();
    expect(patch.permitTtlDefaultSeconds).toBeUndefined();
    expect(patch.permitTtlMaxSeconds).toBeUndefined();
    expect(patch.cpuMaxPct).toBeUndefined();
    expect(patch.memMaxPct).toBeUndefined();
    expect(patch.loadMax).toBeUndefined();
    expect(patch.minCommitsPerHour).toBeUndefined();
    expect(patch.maxTokensSinceCommit).toBeUndefined();
  });
});
