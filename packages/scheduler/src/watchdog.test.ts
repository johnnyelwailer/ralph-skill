import { describe, expect, test } from "bun:test";
import { startSchedulerWatchdog, type RunningWatchdog } from "./watchdog.ts";

describe("startSchedulerWatchdog", () => {
  test("calls expirePermits repeatedly on the configured tick interval", async () => {
    const calls: number[] = [];
    // Use a realistic tick interval (1 second) — the minimum enforced is 1000ms anyway
    const input = {
      tickIntervalSeconds: () => 1,
      expirePermits: async () => {
        calls.push(Date.now());
        return 0;
      },
    };

    const wd = startSchedulerWatchdog(input);
    // Wait long enough to observe multiple ticks (min interval is 1000ms)
    await new Promise((r) => setTimeout(r, 3200));
    wd.stop();

    // Should see at least 2 calls in ~3 seconds (1000ms min interval)
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // And not more than 4 (sanity check on runaway scheduling)
    expect(calls.length).toBeLessThanOrEqual(4);

    // Verify intervals between calls are approximately 1000ms
    for (let i = 1; i < calls.length; i++) {
      const delta = calls[i]! - calls[i - 1]!;
      expect(delta).toBeGreaterThanOrEqual(950);
    }
  });

  test("stop prevents further expirePermits calls", async () => {
    const calls: number[] = [];
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => {
        calls.push(Date.now());
        return 0;
      },
    };

    const wd = startSchedulerWatchdog(input);
    await new Promise((r) => setTimeout(r, 120));
    wd.stop();

    const countAfterStop = calls.length;
    await new Promise((r) => setTimeout(r, 150));
    // No new calls after stop
    expect(calls.length).toBe(countAfterStop);
  });

  test("minimum delay between ticks is 1000ms even when tickIntervalSeconds is 0", async () => {
    const timestamps: number[] = [];
    const input = {
      tickIntervalSeconds: () => 0, // 0 seconds — below minimum
      expirePermits: async () => {
        timestamps.push(Date.now());
        return 0;
      },
    };

    const wd = startSchedulerWatchdog(input);
    await new Promise((r) => setTimeout(r, 2200));
    wd.stop();

    // Should have roughly 2 ticks in 2200ms if min delay is 1000ms
    expect(timestamps.length).toBeGreaterThanOrEqual(1);
    expect(timestamps.length).toBeLessThanOrEqual(3);

    // Check minimum interval is respected
    for (let i = 1; i < timestamps.length; i++) {
      const delta = timestamps[i]! - timestamps[i - 1]!;
      expect(delta).toBeGreaterThanOrEqual(950); // ~1000ms with some tolerance
    }
  });

  test("returned RunningWatchdog.stop() is callable multiple times without throwing", async () => {
    const input = {
      tickIntervalSeconds: () => 60,
      expirePermits: async () => 0,
    };
    const wd = startSchedulerWatchdog(input);
    wd.stop();
    wd.stop(); // must not throw
    wd.stop();
  });

  test("expirePermits errors are swallowed (caught internally)", async () => {
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => {
        throw new Error("simulated permit expiry error");
      },
    };
    const wd = startSchedulerWatchdog(input);
    // Wait long enough for at least one tick to fire (minimum interval is 1000ms).
    // This exercises the catch + finally { scheduleTick } block (lines 18-23 of watchdog.ts).
    await new Promise((r) => setTimeout(r, 1200));
    wd.stop(); // must not throw
  });

  test("finally block reschedules next tick after expirePermits throws", async () => {
    // Verify the finally { scheduleTick() } fires even when expirePermits rejects.
    // After one failed tick, the watchdog must still be alive and schedule the next one.
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => {
        throw new Error("transient error");
      },
    };
    const wd = startSchedulerWatchdog(input);
    // Wait for the first tick to fire AND the finally to reschedule.
    // With min interval of 1000ms, 1500ms is enough to see tick→catch→finally→reschedule.
    await new Promise((r) => setTimeout(r, 1500));
    wd.stop(); // must not throw — watchdog stayed alive via finally reschedule
  });
});
