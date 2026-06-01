/**
 * Integration-level tests for the escapeLabel() behavior in metrics.ts.
 *
 * escapeLabel is a private helper in metrics.ts that escapes backslashes and
 * double-quotes in Prometheus label values. Every provider_id, session_id,
 * and status label passes through it via the handleMetrics dispatcher.
 *
 * Why these tests exist as an integration suite (not a copy-paste of the
 * helper):
 *   - escapeLabel is intentionally not exported from metrics.ts.
 *   - Copying the production regex into a test file would only verify the
 *     test's local copy, not the actual code. If the production regex
 *     drifted, the test would still pass and the bug would be silent.
 *   - Calling handleMetrics() with specially-crafted provider IDs and
 *     session IDs exercises the real production escapeLabel via the public
 *     API path, so any divergence between the test fixture and production
 *     code is caught immediately.
 *
 * Existing tests in metrics.test.ts cover the quote case via integration
 * (one test). This file expands coverage to:
 *   - backslash escaping (the OTHER branch of the production regex)
 *   - both characters in the same value
 *   - only-backslash and only-quote edge cases
 *   - session_id escaping via the scheduler-permit line
 *   - malformed-output detection: the final output must still be a
 *     well-formed Prometheus text line (no unescaped quotes that would
 *     terminate the label early)
 */

import { describe, expect, test } from "bun:test";
import { handleMetrics, type MetricsDeps } from "./metrics.ts";
import { InMemoryProviderHealthStore } from "@aloop/provider-health";
import type { SchedulerService } from "@aloop/scheduler";
import type { SystemSample } from "@aloop/scheduler-gates";

function makeRequest(url: string): Request {
  return new Request(`http://localhost${url}`, { method: "GET" });
}

function makeMockScheduler(inFlight: ReadonlyArray<{ id: string; sessionId: string; providerId: string }> = []): SchedulerService {
  return {
    currentLimits() {
      return {
        concurrencyCap: 5,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 100_000, minCommitsPerHour: 1 },
      };
    },
    listPermits() {
      return inFlight as ReadonlyArray<ReturnType<SchedulerService["listPermits"]>[number]>;
    },
    updateLimits: async () => ({ ok: true }),
    acquirePermit: async () => ({ ok: false, reason: "no permits" }),
    releasePermit: async () => false,
    expirePermits: async () => 0,
  } as unknown as SchedulerService;
}

function makeDeps(overrides: {
  providerHealth?: InMemoryProviderHealthStore;
  scheduler?: SchedulerService;
  systemSample?: () => SystemSample;
} = {}): MetricsDeps {
  return {
    scheduler: overrides.scheduler ?? makeMockScheduler(),
    providerHealth: overrides.providerHealth ?? new InMemoryProviderHealthStore([]),
    systemSample: overrides.systemSample ?? (() => ({ cpuPct: 0, memPct: 0, loadAvg: 0 })),
  };
}

describe("escapeLabel — integration via handleMetrics", () => {
  describe("provider_id escaping (providerHealth path)", () => {
    test("escapes backslash in provider_id — one backslash becomes two", async () => {
      // Windows-style path component in a provider id (e.g. local-hosted fallback
      // on C:\aloop\providers\openai) must escape its backslashes.
      const health = new InMemoryProviderHealthStore(["openai\\local"]);
      health.noteSuccess("openai\\local");
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // The production escapeLabel doubles backslashes, so "openai\\local"
      // (which is the literal 12-char string openai + backslash + local)
      // should appear in the output as 13 chars: openai + 2 backslashes + local.
      expect(text).toContain('provider_id="openai\\\\local"');
    });

    test("escapes double-quote in provider_id — quote is backslash-quoted", async () => {
      const health = new InMemoryProviderHealthStore(['openai"escape']);
      health.noteSuccess('openai"escape');
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      expect(text).toContain('provider_id="openai\\"escape"');
    });

    test("escapes BOTH backslash and quote in the same provider_id", async () => {
      // Pathological: provider id with both characters. The regex must
      // apply BOTH substitutions in the same value.
      const health = new InMemoryProviderHealthStore(['a\\b"c']);
      health.noteSuccess('a\\b"c');
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // backslash first → "a\\b\"c" (12 chars: a, \, \, b, \, ", c)
      expect(text).toContain('provider_id="a\\\\b\\"c"');
    });

    test("handles provider_id with only a single backslash", async () => {
      const health = new InMemoryProviderHealthStore(["\\"]);
      health.noteSuccess("\\");
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // One backslash becomes two.
      expect(text).toContain('provider_id="\\\\"');
    });

    test("handles provider_id with only a single double-quote", async () => {
      const health = new InMemoryProviderHealthStore(['"']);
      health.noteSuccess('"');
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // Quote is escaped to backslash-quote.
      expect(text).toContain('provider_id="\\""');
    });

    test("escaped output is a well-formed Prometheus line (no unescaped quote terminates label early)", async () => {
      // If the production escapeLabel missed a quote, the next character would
      // be parsed as outside the label, producing a syntactically invalid
      // Prometheus line. We assert the surrounding line structure remains
      // correct.
      const health = new InMemoryProviderHealthStore(['p"id']);
      health.noteSuccess('p"id');
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // Find the provider_up line. The line should be:
      //   aloop_provider_up{provider_id="p\"id",status="..."} 1
      // The closing "} must come AFTER the escaped quote, not before.
      const lineMatch = text.match(/^aloop_provider_up\{[^}]+\} \d+$/m);
      expect(lineMatch).not.toBeNull();
      // And it must include the escaped quote, not a raw quote that would
      // terminate the label prematurely.
      const lineContent = lineMatch![0];
      expect(lineContent).toContain('\\"');
      const escapedQuotes = lineContent.match(/\\"/g) ?? [];
      expect(escapedQuotes.length).toBeGreaterThan(0);
    });
  });

  describe("session_id and provider_id escaping (scheduler permits path)", () => {
    test("escapes backslash in sessionId on aloop_scheduler_permit line", async () => {
      const permits = [
        { id: "p1", sessionId: "sess\\abc", providerId: "openai" },
      ];
      const deps = makeDeps({ scheduler: makeMockScheduler(permits) });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      expect(text).toContain('aloop_scheduler_permit{session_id="sess\\\\abc",provider_id="openai"} 1');
    });

    test("escapes double-quote in sessionId on aloop_scheduler_permit line", async () => {
      const permits = [
        { id: "p1", sessionId: 'sess"abc', providerId: "openai" },
      ];
      const deps = makeDeps({ scheduler: makeMockScheduler(permits) });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      expect(text).toContain('aloop_scheduler_permit{session_id="sess\\"abc",provider_id="openai"} 1');
    });

    test("escapes backslash in permit providerId", async () => {
      const permits = [
        { id: "p1", sessionId: "sess_abc", providerId: "openai\\local" },
      ];
      const deps = makeDeps({ scheduler: makeMockScheduler(permits) });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      expect(text).toContain('aloop_scheduler_permit{session_id="sess_abc",provider_id="openai\\\\local"} 1');
    });

    test("escapes quote in permit providerId", async () => {
      const permits = [
        { id: "p1", sessionId: "sess_abc", providerId: 'openai"x' },
      ];
      const deps = makeDeps({ scheduler: makeMockScheduler(permits) });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      expect(text).toContain('aloop_scheduler_permit{session_id="sess_abc",provider_id="openai\\"x"} 1');
    });

    test("null sessionId is rendered as empty string and still escaped (production uses ?? '')", async () => {
      // The production code does escapeLabel(permit.sessionId ?? "").
      // If sessionId is null, the value is "" and escaping leaves it "".
      // We assert the label is present and empty (not missing or undefined).
      const permits = [
        { id: "p1", sessionId: null, providerId: "openai" },
      ];
      const deps = makeDeps({ scheduler: makeMockScheduler(permits as unknown as Array<{ id: string; sessionId: string; providerId: string }>) });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      expect(text).toContain('aloop_scheduler_permit{session_id="",provider_id="openai"} 1');
    });
  });

  describe("escaping is applied to every line that contains the affected label", () => {
    test("backslash in provider_id is escaped on all 4 provider health lines", async () => {
      const health = new InMemoryProviderHealthStore(["p\\x"]);
      health.noteSuccess("p\\x");
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // All four provider_id lines must contain the escaped form.
      const escapedForm = 'provider_id="p\\\\x"';
      // 1 line for up, 1 for consecutive_failures, 1 for cooldown_until, 1 for quota_remaining
      const matches = text.match(new RegExp(escapedForm.replace(/\\/g, "\\\\"), "g"));
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(4);
    });

    test("quote in provider_id is escaped on all 4 provider health lines", async () => {
      const health = new InMemoryProviderHealthStore(['p"x']);
      health.noteSuccess('p"x');
      const deps = makeDeps({ providerHealth: health });

      const res = await handleMetrics(makeRequest("/v1/metrics"), deps, "/v1/metrics");
      const text = await res!.text();

      // Up line has TWO escaped labels (provider_id AND status).
      // Other three lines have ONE (provider_id only).
      // So we expect 4 provider_id escaped occurrences and 1 status escape.
      const providerIdEscaped = text.match(/provider_id="p\\"x"/g) ?? [];
      expect(providerIdEscaped.length).toBe(4);

      // status is fixed ("healthy") — no special chars — but it should still
      // be present and not corrupted.
      expect(text).toContain('status="healthy"');
    });
  });
});
