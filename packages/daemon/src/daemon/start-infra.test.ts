import { describe, expect, test } from "bun:test";
import { buildCooldownMultipliers } from "./start-infra.ts";

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
