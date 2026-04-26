import { describe, expect, test } from "bun:test";
import { pick } from "./daemon-mergers-pick.ts";

describe("pick", () => {
  test("returns snake_case value when present", () => {
    const obj = { tick_interval: 30, tickIntervalSeconds: 60 };
    expect(pick(obj, "tick_interval", "tickIntervalSeconds")).toBe(30);
  });

  test("returns camelCase value when snake_case is absent", () => {
    const obj = { tickIntervalSeconds: 60 };
    expect(pick(obj, "tick_interval", "tickIntervalSeconds")).toBe(60);
  });

  test("prefers snake_case over camelCase when both are present", () => {
    const obj = { concurrency_cap: 3, concurrencyCap: 5 };
    expect(pick(obj, "concurrency_cap", "concurrencyCap")).toBe(3);
  });

  test("returns undefined when neither key is present", () => {
    const obj = { other_key: 1 };
    expect(pick(obj, "missing_snake", "missingCamel")).toBeUndefined();
  });

  test("returns undefined for empty object", () => {
    expect(pick({}, "key_snake", "keyCamel")).toBeUndefined();
  });

  test("returns falsy snake_case value (0) when present", () => {
    const obj = { tick_interval: 0 };
    expect(pick(obj, "tick_interval", "tickIntervalSeconds")).toBe(0);
  });

  test("returns falsy camelCase value (false) when snake_case is absent", () => {
    const obj = { enabled: false };
    expect(pick(obj, "is_enabled", "enabled")).toBe(false);
  });

  test("handles numeric snake_case value", () => {
    const obj = { cpu_max_pct: 80 };
    expect(pick(obj, "cpu_max_pct", "cpuMaxPct")).toBe(80);
  });

  test("handles nested object as value", () => {
    const obj = { burn_rate: { min_commits_per_hour: 10 } };
    const result = pick(obj, "burn_rate", "burnRate") as { min_commits_per_hour: number } | undefined;
    expect(result).toEqual({ min_commits_per_hour: 10 });
  });

  test("works with string values", () => {
    const obj = { log_level: "debug" };
    expect(pick(obj, "log_level", "logLevel")).toBe("debug");
  });
});
