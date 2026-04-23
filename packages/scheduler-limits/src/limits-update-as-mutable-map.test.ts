import { describe, expect, test } from "bun:test";
import { updateSchedulerLimits } from "./limits-update";

// These tests target asMutableMap indirectly via updateSchedulerLimits.
// The function lives in limits-update.ts and converts unknown→Record<string,unknown>.
// We verify its edge-case behaviour through the public API.

describe("asMutableMap edge cases via updateSchedulerLimits", () => {
  test("empty patch {} is valid — exercises asMutableMap on nested config objects", async () => {
    // normalizeLimitsPatch returns {} for {}, so Object.keys(patch).length === 0.
    // But the test "empty patch {} is accepted" in limits-update.test.ts shows ok=true
    // because the current daemon defaults ARE valid. This verifies the asMutableMap({})
    // fallback path does not throw when system_limits/burn_rate are objects.
    const h = makeHarness();
    const result = await updateSchedulerLimits(h.config, h.events, {});
    expect(result.ok).toBe(true);
    await h.close();
  });

  test("partial patch with only nested system_limits exercises asMutableMap on system_limits", async () => {
    // When system_limits exists in the config and is a valid object,
    // asMutableMap returns it directly. When only burn_rate fields are patched,
    // the system_limits path still exists in the config as a valid object.
    const h = makeHarness();
    // Update only burn_rate fields — system_limits in config remains a valid object
    const result = await updateSchedulerLimits(h.config, h.events, {
      burn_rate: { min_commits_per_hour: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.burnRate.minCommitsPerHour).toBe(1);
    }
    await h.close();
  });

  test("partial patch with only nested burn_rate exercises asMutableMap on burn_rate", async () => {
    const h = makeHarness();
    // Update only system_limits — burn_rate in config remains a valid object
    const result = await updateSchedulerLimits(h.config, h.events, {
      system_limits: { cpu_max_pct: 50 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.systemLimits.cpuMaxPct).toBe(50);
    }
    await h.close();
  });
});

import {
  createEventWriter,
  EventCountsProjector,
  JsonlEventStore,
  loadBundledMigrations,
  migrate,
  PermitProjector,
} from "@aloop/state-sqlite";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DAEMON_DEFAULTS,
  createConfigStore,
  resolveDaemonPaths,
  type ConfigStore,
} from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";

type Harness = {
  home: string;
  events: EventWriter;
  config: ConfigStore;
  logPath: string;
  close(): Promise<void>;
};

function makeHarness(): Harness {
  const home = mkdtempSync(join(tmpdir(), "aloop-asmutable-test-"));
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const logPath = join(home, "aloopd.log");
  const store = new JsonlEventStore(logPath);
  const events = createEventWriter({
    db,
    store,
    projectors: [new EventCountsProjector(), new PermitProjector()],
    nextId: () => `evt_${crypto.randomUUID()}`,
  });
  const paths = resolveDaemonPaths({ ALOOP_HOME: home });
  const config = createConfigStore({
    daemon: DAEMON_DEFAULTS,
    overrides: { allow: null, deny: null, force: null },
    paths,
  });
  return {
    home,
    events,
    config,
    logPath,
    async close() {
      await store.close();
      db.close();
    },
  };
}
