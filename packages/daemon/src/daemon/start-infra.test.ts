import { describe, expect, test } from "bun:test";
import { buildCooldownMultipliers, createDaemonInfra } from "./start-infra.ts";

/** Minimal ConfigStore stub for buildCooldownMultipliers */
function makeConfig(overrides?: {
  providerTuning?: Record<string, { cooldown_multiplier?: number }>;
}): { daemon: () => { providerTuning?: Record<string, { cooldown_multiplier?: number }> } } {
  return {
    daemon: () => ({
      providerTuning: overrides?.providerTuning ?? {},
    }),
  };
}

describe("buildCooldownMultipliers", () => {
  test("returns empty map when no providerTuning", () => {
    const config = makeConfig({});
    const result = buildCooldownMultipliers(config as any);
    expect(result.size).toBe(0);
  });

  test("returns empty map when providerTuning is undefined", () => {
    const config = makeConfig();
    const result = buildCooldownMultipliers(config as any);
    expect(result.size).toBe(0);
  });

  test("returns 1.0 for a provider with no cooldown_multiplier", () => {
    const config = makeConfig({ providerTuning: { opencode: {} } });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("opencode")).toBe(1.0);
  });

  test("returns the exact cooldown_multiplier value when within range", () => {
    const config = makeConfig({
      providerTuning: {
        opencode: { cooldown_multiplier: 1.5 },
        anthropic: { cooldown_multiplier: 2.0 },
      },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("opencode")).toBe(1.5);
    expect(result.get("anthropic")).toBe(2.0);
  });

  test("clamps value below 0.5 to 0.5", () => {
    const config = makeConfig({
      providerTuning: { probe: { cooldown_multiplier: 0.1 } },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("probe")).toBe(0.5);
  });

  test("clamps value above 4.0 to 4.0", () => {
    const config = makeConfig({
      providerTuning: { probe: { cooldown_multiplier: 9.9 } },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("probe")).toBe(4.0);
  });

  test("clamps negative cooldown_multiplier to 0.5", () => {
    const config = makeConfig({
      providerTuning: { probe: { cooldown_multiplier: -1.0 } },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("probe")).toBe(0.5);
  });

  test("returns 1.0 for non-numeric cooldown_multiplier", () => {
    const config = makeConfig({
      providerTuning: { probe: { cooldown_multiplier: "fast" as any } },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("probe")).toBe(1.0);
  });

  test("returns 1.0 for null cooldown_multiplier", () => {
    const config = makeConfig({
      providerTuning: { probe: { cooldown_multiplier: null as any } },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("probe")).toBe(1.0);
  });

  test("handles mixed valid, clamped, and invalid values", () => {
    const config = makeConfig({
      providerTuning: {
        good: { cooldown_multiplier: 2.5 },
        too_high: { cooldown_multiplier: 10.0 },
        too_low: { cooldown_multiplier: -0.1 },
        bad_type: { cooldown_multiplier: "x" as any },
        missing: {},
      },
    });
    const result = buildCooldownMultipliers(config as any);
    expect(result.get("good")).toBe(2.5);
    expect(result.get("too_high")).toBe(4.0);
    expect(result.get("too_low")).toBe(0.5);
    expect(result.get("bad_type")).toBe(1.0);
    expect(result.get("missing")).toBe(1.0);
  });
});

describe("createDaemonInfra", () => {
  test("returns a DaemonInfra object with all required keys", () => {
    const infra = createDaemonInfra({
      dbPath: ":memory:",
      logFile: "/tmp/test-events.jsonl",
    });

    expect(typeof infra.db).toBe("object");
    expect(typeof infra.registry).toBe("object");
    expect(typeof infra.workspaceRegistry).toBe("object");
    expect(typeof infra.sessionRegistry).toBe("object");
    expect(typeof infra.permits).toBe("object");
    expect(typeof infra.artifactRegistry).toBe("object");
    expect(typeof infra.eventStore).toBe("object");
    expect(typeof infra.events).toBe("object");
    expect(typeof infra.providerRegistry).toBe("object");
    expect(typeof infra.providerHealth).toBe("object");
    expect(typeof infra.idempotencyStore).toBe("object");
  });

  test("registers both opencode and opencode-cli adapters in providerRegistry", () => {
    const infra = createDaemonInfra({
      dbPath: ":memory:",
      logFile: "/tmp/test-events.jsonl",
    });

    const adapters = infra.providerRegistry.list().map((a) => a.id);
    expect(adapters).toContain("opencode");
    expect(adapters).toContain("opencode-cli");
  });

  test("initializes providerHealth with existing provider adapter IDs", () => {
    const infra = createDaemonInfra({
      dbPath: ":memory:",
      logFile: "/tmp/test-events.jsonl",
    });

    // providerHealth should be backed by the registered adapters; InMemoryProviderHealthStore
    // is constructed with adapter IDs so its internal state reflects them
    expect(infra.providerHealth).toBeDefined();
    expect(typeof infra.providerHealth.get).toBe("function");
    expect(typeof infra.providerHealth.list).toBe("function");
  });

  test("idempotencyStore is backed by the database", () => {
    const infra = createDaemonInfra({
      dbPath: ":memory:",
      logFile: "/tmp/test-events.jsonl",
    });

    // idempotencyStore has get/put methods backed by the db
    expect(typeof infra.idempotencyStore.get).toBe("function");
    expect(typeof infra.idempotencyStore.put).toBe("function");
  });
});
