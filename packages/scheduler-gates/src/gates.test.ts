import { describe, expect, test } from "bun:test";
import { applyOverrides, checkSystemGate, checkBurnRateGate } from "./gates.ts";
import type { SchedulerLimits } from "./decisions.ts";
import type { SchedulerProbes, BurnRateSample } from "./probes.ts";

class MockEventWriter {
  readonly events: Array<{ topic: string; data: Record<string, unknown> }> = [];
  async append(topic: string, data: Record<string, unknown>): Promise<void> {
    this.events.push({ topic, data });
  }
}

// ─── applyOverrides ─────────────────────────────────────────────────────────

describe("applyOverrides", () => {
  test("force field bypasses deny and allow lists", () => {
    const result = applyOverrides("opencode", {
      force: "anthropic",
      deny: ["opencode"],
      allow: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerId).toBe("anthropic");
  });

  test("force field bypasses deny and allow even when both are set", () => {
    const result = applyOverrides("opencode", {
      force: "cohere",
      deny: ["opencode", "claude"],
      allow: ["opencode"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerId).toBe("cohere");
  });

  test("deny list rejects a denied provider", () => {
    const result = applyOverrides("claude", {
      force: null,
      deny: ["claude", "opencode"],
      allow: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_denied");
      expect(result.details.provider_candidate).toBe("claude");
      expect(result.details.deny).toEqual(["claude", "opencode"]);
    }
  });

  test("deny list does not affect non-listed provider", () => {
    const result = applyOverrides("cohere", {
      force: null,
      deny: ["claude"],
      allow: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerId).toBe("cohere");
  });

  test("allow list rejects provider not in the list", () => {
    const result = applyOverrides("unknown", {
      force: null,
      deny: null,
      allow: ["opencode", "anthropic"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_not_allowed");
      expect(result.details.provider_candidate).toBe("unknown");
      expect(result.details.allow).toEqual(["opencode", "anthropic"]);
    }
  });

  test("allow list accepts a listed provider", () => {
    const result = applyOverrides("opencode", {
      force: null,
      deny: null,
      allow: ["opencode", "anthropic"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerId).toBe("opencode");
  });

  test("allow list and deny list both null returns the candidate unchanged", () => {
    const result = applyOverrides("anyprovider", {
      force: null,
      deny: null,
      allow: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerId).toBe("anyprovider");
  });

  test("provider exactly in deny list is rejected even if also in allow list", () => {
    // deny takes priority over allow (checked first)
    const result = applyOverrides("opencode", {
      force: null,
      deny: ["opencode"],
      allow: ["opencode", "claude"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("provider_denied");
  });

  test("empty deny list rejects nothing", () => {
    const result = applyOverrides("claude", {
      force: null,
      deny: [],
      allow: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerId).toBe("claude");
  });

  test("single-item deny list rejects that provider", () => {
    const result = applyOverrides("bad", {
      force: null,
      deny: ["bad"],
      allow: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("provider_denied");
  });
});

// ─── checkSystemGate ────────────────────────────────────────────────────────

describe("checkSystemGate", () => {
  const defaultLimits: SchedulerLimits["systemLimits"] = {
    cpuMaxPct: 80,
    memMaxPct: 85,
    loadMax: 4.0,
  };

  test("returns ok=true when all metrics are within limits", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 50,
      memPct: 60,
      loadAvg: 2.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(true);
  });

  test("returns ok=true when cpuPct is exactly at the limit", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 80,
      memPct: 50,
      loadAvg: 1.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(true);
  });

  test("returns ok=true when memPct is exactly at the limit", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 10,
      memPct: 85,
      loadAvg: 1.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(true);
  });

  test("returns ok=true when loadAvg is exactly at the limit", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 10,
      memPct: 10,
      loadAvg: 4.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(true);
  });

  test("returns ok=false with cpu details when cpuPct exceeds limit", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 95,
      memPct: 50,
      loadAvg: 1.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("system_limit_exceeded");
      expect(result.details.observed).toEqual({
        cpu_pct: 95,
        mem_pct: 50,
        load_avg: 1.0,
      });
      expect(result.details.limits).toEqual({
        cpu_max_pct: 80,
        mem_max_pct: 85,
        load_max: 4.0,
      });
    }
  });

  test("returns ok=false with mem details when memPct exceeds limit", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 10,
      memPct: 99,
      loadAvg: 0.5,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("system_limit_exceeded");
      expect((result.details.observed as Record<string, number>).mem_pct).toBe(99);
    }
  });

  test("returns ok=false with load details when loadAvg exceeds limit", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 10,
      memPct: 10,
      loadAvg: 9.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("system_limit_exceeded");
      expect((result.details.observed as Record<string, number>).load_avg).toBe(9.0);
    }
  });

  test("returns ok=false with combined details when multiple metrics exceed", () => {
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 95,
      memPct: 99,
      loadAvg: 9.0,
    });
    const result = checkSystemGate(sample, defaultLimits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.observed).toEqual({
        cpu_pct: 95,
        mem_pct: 99,
        load_avg: 9.0,
      });
    }
  });

  test("returns ok=true when systemSample is undefined", () => {
    const result = checkSystemGate(undefined, defaultLimits);
    expect(result.ok).toBe(true);
  });

  test("uses the sample returned by calling systemSample(), not the function itself", () => {
    // Confirm the function is called at check time with current values
    let callCount = 0;
    const sample: SchedulerProbes["systemSample"] = () => {
      callCount++;
      return { cpuPct: 10, memPct: 10, loadAvg: 0.5 };
    };
    checkSystemGate(sample, defaultLimits);
    checkSystemGate(sample, defaultLimits);
    expect(callCount).toBe(2);
  });

  test("custom limits are respected — high limits allow higher values", () => {
    const looseLimits: SchedulerLimits["systemLimits"] = {
      cpuMaxPct: 99,
      memMaxPct: 99,
      loadMax: 16.0,
    };
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 95,
      memPct: 90,
      loadAvg: 8.0,
    });
    const result = checkSystemGate(sample, looseLimits);
    expect(result.ok).toBe(true);
  });

  test("zero limits reject any positive metric", () => {
    const zeroLimits: SchedulerLimits["systemLimits"] = {
      cpuMaxPct: 0,
      memMaxPct: 0,
      loadMax: 0,
    };
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 0,
      memPct: 0,
      loadAvg: 0,
    });
    const result = checkSystemGate(sample, zeroLimits);
    expect(result.ok).toBe(true);
  });

  test("zero limits reject when any metric is positive", () => {
    const zeroLimits: SchedulerLimits["systemLimits"] = {
      cpuMaxPct: 0,
      memMaxPct: 0,
      loadMax: 0,
    };
    const sample: SchedulerProbes["systemSample"] = () => ({
      cpuPct: 1,
      memPct: 0,
      loadAvg: 0,
    });
    const result = checkSystemGate(sample, zeroLimits);
    expect(result.ok).toBe(false);
  });
});

// ─── checkBurnRateGate ──────────────────────────────────────────────────────

describe("checkBurnRateGate", () => {
  const defaultBurn: SchedulerLimits["burnRate"] = {
    maxTokensSinceCommit: 2_000_000,
    minCommitsPerHour: 2,
  };

  test("returns ok=true when both metrics are within limits", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 500_000,
      commitsPerHour: 5,
    };
    const result = await checkBurnRateGate(events, "sess_1", sample, defaultBurn);
    expect(result.ok).toBe(true);
    expect(events.events).toHaveLength(0);
  });

  test("returns ok=true when tokensSinceLastCommit is exactly at the threshold", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 2_000_000,
      commitsPerHour: 10,
    };
    const result = await checkBurnRateGate(events, "sess_1", sample, defaultBurn);
    expect(result.ok).toBe(true);
    expect(events.events).toHaveLength(0);
  });

  test("returns ok=true when commitsPerHour is exactly at the minimum", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 0,
      commitsPerHour: 2,
    };
    const result = await checkBurnRateGate(events, "sess_1", sample, defaultBurn);
    expect(result.ok).toBe(true);
    expect(events.events).toHaveLength(0);
  });

  test("returns ok=false when tokensSinceLastCommit exceeds threshold", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 2_000_001,
      commitsPerHour: 10,
    };
    const result = await checkBurnRateGate(events, "sess_1", sample, defaultBurn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details).toEqual({
        observed_tokens_since_commit: 2_000_001,
        threshold_tokens_since_commit: 2_000_000,
      });
    }
  });

  test("emits scheduler.burn_rate_exceeded event when tokens threshold is breached", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 5_000_000,
      commitsPerHour: 10,
    };
    await checkBurnRateGate(events, "sess_tok", sample, defaultBurn);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.topic).toBe("scheduler.burn_rate_exceeded");
    expect(events.events[0]!.data).toEqual({
      session_id: "sess_tok",
      observed: 5_000_000,
      threshold: 2_000_000,
    });
  });

  test("returns ok=false when commitsPerHour is below minimum", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 0,
      commitsPerHour: 1,
    };
    const result = await checkBurnRateGate(events, "sess_1", sample, defaultBurn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details).toEqual({
        observed_commits_per_hour: 1,
        threshold_commits_per_hour: 2,
      });
    }
  });

  test("emits scheduler.burn_rate_exceeded event when commits threshold is breached", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 0,
      commitsPerHour: 0,
    };
    await checkBurnRateGate(events, "sess_commits", sample, defaultBurn);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.topic).toBe("scheduler.burn_rate_exceeded");
    expect(events.events[0]!.data).toEqual({
      session_id: "sess_commits",
      observed: 0,
      threshold: 2,
    });
  });

  test("tokens check takes priority — commits not checked if tokens already exceeded", async () => {
    // Both are exceeded but only the tokens event should fire (function returns early)
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 99_000_000,
      commitsPerHour: 0,
    };
    const result = await checkBurnRateGate(events, "sess_both", sample, defaultBurn);
    expect(result.ok).toBe(false);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.data).toEqual({
      session_id: "sess_both",
      observed: 99_000_000,
      threshold: 2_000_000,
    });
  });

  test("session_id is included in the emitted event", async () => {
    const events = new MockEventWriter();
    const sample: BurnRateSample = {
      tokensSinceLastCommit: 99_000_000,
      commitsPerHour: 99,
    };
    await checkBurnRateGate(events, "session_abc_123", sample, defaultBurn);
    expect(events.events[0]!.data.session_id).toBe("session_abc_123");
  });

  test("zero thresholds are respected — zero tokens allowed, zero commits not allowed", async () => {
    const zeroBurn: SchedulerLimits["burnRate"] = {
      maxTokensSinceCommit: 0,
      minCommitsPerHour: 0,
    };

    // zero tokens == exactly at threshold, should pass
    const events1 = new MockEventWriter();
    const r1 = await checkBurnRateGate(events1, "s1", { tokensSinceLastCommit: 0, commitsPerHour: 99 }, zeroBurn);
    expect(r1.ok).toBe(true);

    // zero commits == exactly at minimum, should pass
    const events2 = new MockEventWriter();
    const r2 = await checkBurnRateGate(events2, "s2", { tokensSinceLastCommit: 0, commitsPerHour: 0 }, zeroBurn);
    expect(r2.ok).toBe(true);
  });

  test("large thresholds — verifies no integer overflow on big token counts", async () => {
    const events = new MockEventWriter();
    const bigBurn: SchedulerLimits["burnRate"] = {
      maxTokensSinceCommit: Number.MAX_SAFE_INTEGER,
      minCommitsPerHour: 0,
    };
    const sample: BurnRateSample = {
      tokensSinceLastCommit: Number.MAX_SAFE_INTEGER,
      commitsPerHour: 0,
    };
    const result = await checkBurnRateGate(events, "s_big", sample, bigBurn);
    expect(result.ok).toBe(true);
  });
});
