import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  applyOverrides,
  checkSystemGate,
} from "./gates.ts";
import type { ProviderOverrides, SchedulerLimits } from "./decisions.ts";
import type { SchedulerProbes } from "./probes.ts";
import {
  createEventWriter,
  EventCountsProjector,
  JsonlEventStore,
  loadBundledMigrations,
  migrate,
  PermitProjector,
  readAllEvents,
} from "@aloop/state-sqlite";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBurnRateGate } from "./gates.ts";

// --- applyOverrides ---

describe("applyOverrides", () => {
  const provider = "opencode";

  test("force returns forced provider", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: "anthropic" };
    const result = applyOverrides(provider, overrides);
    expect(result).toEqual({ ok: true, providerId: "anthropic" });
  });

  test("deny list rejects denied provider", () => {
    const overrides: ProviderOverrides = { allow: null, deny: ["opencode", "claude"], force: null };
    const result = applyOverrides(provider, overrides);
    expect(result).toEqual({
      ok: false,
      reason: "provider_denied",
      details: { provider_candidate: provider, deny: ["opencode", "claude"] },
    });
  });

  test("allow list rejects provider not in list", () => {
    const overrides: ProviderOverrides = { allow: ["anthropic", "cohere"], deny: null, force: null };
    const result = applyOverrides(provider, overrides);
    expect(result).toEqual({
      ok: false,
      reason: "provider_not_allowed",
      details: { provider_candidate: provider, allow: ["anthropic", "cohere"] },
    });
  });

  test("allow list accepts provider in list", () => {
    const overrides: ProviderOverrides = { allow: ["opencode", "claude"], deny: null, force: null };
    const result = applyOverrides(provider, overrides);
    expect(result).toEqual({ ok: true, providerId: provider });
  });

  test("deny takes priority over allow when both would pass", () => {
    const overrides: ProviderOverrides = {
      allow: ["opencode"],
      deny: ["opencode"],
      force: null,
    };
    const result = applyOverrides(provider, overrides);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("provider_denied");
  });
});

// --- checkSystemGate ---

describe("checkSystemGate", () => {
  const makeLimits = (overrides: Partial<SchedulerLimits["systemLimits"]> = {}): SchedulerLimits["systemLimits"] => ({
    cpuMaxPct: 80,
    memMaxPct: 85,
    loadMax: 4.0,
    ...overrides,
  });

  test("returns ok when no systemSample is provided", () => {
    const result = checkSystemGate(undefined, makeLimits());
    expect(result).toEqual({ ok: true });
  });

  test("returns ok when all metrics are within limits", () => {
    const probe = (): SchedulerProbes["systemSample"] => ({
      cpuPct: 50,
      memPct: 60,
      loadAvg: 2.0,
    });
    const result = checkSystemGate(probe, makeLimits());
    expect(result).toEqual({ ok: true });
  });

  test("returns ok when a metric is exactly at its limit", () => {
    const probe = (): SchedulerProbes["systemSample"] => ({
      cpuPct: 80,
      memPct: 85,
      loadAvg: 4.0,
    });
    const result = checkSystemGate(probe, makeLimits());
    expect(result).toEqual({ ok: true });
  });

  test("denies when cpuPct exceeds limit", () => {
    const probe = (): SchedulerProbes["systemSample"] => ({
      cpuPct: 81,
      memPct: 50,
      loadAvg: 1.0,
    });
    const result = checkSystemGate(probe, makeLimits());
    expect(result).toEqual({
      ok: false,
      reason: "system_limit_exceeded",
      details: {
        observed: { cpu_pct: 81, mem_pct: 50, load_avg: 1.0 },
        limits: { cpu_max_pct: 80, mem_max_pct: 85, load_max: 4.0 },
      },
    });
  });

  test("denies when memPct exceeds limit", () => {
    const probe = (): SchedulerProbes["systemSample"] => ({
      cpuPct: 10,
      memPct: 86,
      loadAvg: 0.5,
    });
    const result = checkSystemGate(probe, makeLimits());
    expect(result.ok).toBe(false);
    expect(result.details.observed.mem_pct).toBe(86);
  });

  test("denies when loadAvg exceeds limit", () => {
    const probe = (): SchedulerProbes["systemSample"] => ({
      cpuPct: 10,
      memPct: 10,
      loadAvg: 5.0,
    });
    const result = checkSystemGate(probe, makeLimits());
    expect(result.ok).toBe(false);
    expect(result.details.observed.load_avg).toBe(5.0);
  });

  test("denies when multiple limits are exceeded", () => {
    const probe = (): SchedulerProbes["systemSample"] => ({
      cpuPct: 95,
      memPct: 95,
      loadAvg: 8.0,
    });
    const result = checkSystemGate(probe, makeLimits());
    expect(result.ok).toBe(false);
    expect(result.details.observed).toEqual({
      cpu_pct: 95,
      mem_pct: 95,
      load_avg: 8.0,
    });
  });
});

// --- checkBurnRateGate ---

describe("checkBurnRateGate", () => {
  let home: string;
  let db: Database;
  let logPath: string;
  let events: ReturnType<typeof createEventWriter>["events"];

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-burn-rate-gate-"));
    db = new Database(":memory:");
    migrate(db, loadBundledMigrations());
    logPath = join(home, "aloopd.log");
    const store = new JsonlEventStore(logPath);
    const writer = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector(), new PermitProjector()],
      nextId: () => `evt_${crypto.randomUUID()}`,
    });
    events = writer;
  });

  afterEach(async () => {
    await events.append("test.teardown", {});
    db.close();
    rmSync(home, { recursive: true, force: true });
  });

  const burnRate: SchedulerLimits["burnRate"] = {
    maxTokensSinceCommit: 1_000_000,
    minCommitsPerHour: 10,
  };

  test("returns ok when both metrics are within limits", async () => {
    const sample = { tokensSinceLastCommit: 500_000, commitsPerHour: 20 };
    const result = await checkBurnRateGate(events, "s1", sample, burnRate);
    expect(result).toEqual({ ok: true });
  });

  test("returns ok when tokens exactly at threshold", async () => {
    const sample = { tokensSinceLastCommit: 1_000_000, commitsPerHour: 20 };
    const result = await checkBurnRateGate(events, "s2", sample, burnRate);
    expect(result).toEqual({ ok: true });
  });

  test("returns ok when commitsPerHour exactly at threshold", async () => {
    const sample = { tokensSinceLastCommit: 500_000, commitsPerHour: 10 };
    const result = await checkBurnRateGate(events, "s3", sample, burnRate);
    expect(result).toEqual({ ok: true });
  });

  test("denies when tokensSinceLastCommit exceeds threshold", async () => {
    const sample = { tokensSinceLastCommit: 1_000_001, commitsPerHour: 20 };
    const result = await checkBurnRateGate(events, "s4", sample, burnRate);

    expect(result.ok).toBe(false);
    expect(result.details).toEqual({
      observed_tokens_since_commit: 1_000_001,
      threshold_tokens_since_commit: 1_000_000,
    });

    const allEvents = await readAllEvents(logPath);
    expect(allEvents.some((e) => e.topic === "scheduler.burn_rate_exceeded")).toBe(true);
  });

  test("denies when commitsPerHour is below threshold", async () => {
    const sample = { tokensSinceLastCommit: 500_000, commitsPerHour: 5 };
    const result = await checkBurnRateGate(events, "s5", sample, burnRate);

    expect(result.ok).toBe(false);
    expect(result.details).toEqual({
      observed_commits_per_hour: 5,
      threshold_commits_per_hour: 10,
    });
  });

  test("tokensExceeded denial fires before commitsPerHour check when both exceed", async () => {
    const sample = { tokensSinceLastCommit: 2_000_000, commitsPerHour: 0 };
    const result = await checkBurnRateGate(events, "s6", sample, burnRate);

    expect(result.ok).toBe(false);
    // tokensExceeded is checked first
    expect(result.details).toEqual({
      observed_tokens_since_commit: 2_000_000,
      threshold_tokens_since_commit: 1_000_000,
    });
  });
});
