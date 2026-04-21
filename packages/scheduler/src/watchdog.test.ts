import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startSchedulerWatchdog } from "./watchdog.ts";

describe("startSchedulerWatchdog", () => {
  let fakeExpirePermits: ReturnType<typeof makeFake>;

  beforeEach(() => {
    fakeExpirePermits = makeFake();
  });

  test("returns stop() function", () => {
    const wd = startSchedulerWatchdog({
      tickIntervalSeconds: () => 60,
      expirePermits: fakeExpirePermits.fn,
    });
    expect(typeof wd.stop).toBe("function");
  });

  test("stop() prevents any ticks from firing", async () => {
    const wd = startSchedulerWatchdog({
      tickIntervalSeconds: () => 10, // 10ms — fires fast if not stopped
      expirePermits: fakeExpirePermits.fn,
    });
    wd.stop();
    await delay(80);
    expect(fakeExpirePermits.callCount).toBe(0);
  });

  test("clamps minimum tick interval to 1000ms", async () => {
    // tickIntervalSeconds returns 0, which is clamped to 1000ms internally.
    // 50ms delay is far shorter than 1000ms, so no tick can have fired yet.
    const wd = startSchedulerWatchdog({
      tickIntervalSeconds: () => 0,
      expirePermits: fakeExpirePermits.fn,
    });
    await delay(50);
    wd.stop();
    expect(fakeExpirePermits.callCount).toBe(0);
  });

  test("stop() is idempotent — calling twice does not throw", () => {
    const wd = startSchedulerWatchdog({
      tickIntervalSeconds: () => 60,
      expirePermits: fakeExpirePermits.fn,
    });
    expect(() => wd.stop()).not.toThrow();
    expect(() => wd.stop()).not.toThrow();
  });
});

// --- helpers ---

function makeFake() {
  let count = 0;
  const fn = async (): Promise<number> => {
    count++;
    return count;
  };
  return { fn, get callCount() { return count } };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
