import { describe, expect, test } from "bun:test";
import { DAEMON_DEFAULTS, OVERRIDES_DEFAULT, type ConfigStore } from "@aloop/daemon-config";
import { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import { handleProviders, type ProvidersDeps } from "./providers.ts";

function makeConfigStore(): ConfigStore {
  let overrides = { ...OVERRIDES_DEFAULT };
  return {
    daemon: () => DAEMON_DEFAULTS,
    overrides: () => overrides,
    paths: () => ({
      home: "/tmp/aloop-home",
      pidFile: "/tmp/aloop-home/aloopd.pid",
      socketFile: "/tmp/aloop-home/aloopd.sock",
      stateDir: "/tmp/aloop-home/state",
      logFile: "/tmp/aloop-home/state/aloopd.log",
      daemonConfigFile: "/tmp/aloop-home/daemon.yml",
      overridesFile: "/tmp/aloop-home/overrides.yml",
    }),
    reload: () => ({ ok: true, daemon: DAEMON_DEFAULTS, overrides }),
    setDaemon: () => DAEMON_DEFAULTS,
    setOverrides: (next) => {
      overrides = { ...next };
      return overrides;
    },
  };
}

function makeDeps(): ProvidersDeps {
  const providerRegistry = new ProviderRegistry();
  return {
    config: makeConfigStore(),
    events: {
      append: async (topic, data) => ({
        _v: 1,
        id: "evt_test",
        timestamp: new Date(0).toISOString(),
        topic,
        data,
      }),
    },
    providerRegistry,
    providerHealth: new InMemoryProviderHealthStore(providerRegistry.list().map((it) => it.id)),
  };
}

describe("handleProviders", () => {
  test("returns undefined for unrelated path", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/unrelated"),
      makeDeps(),
      "/v1/unrelated",
    );
    expect(res).toBeUndefined();
  });

  test("GET /v1/providers returns v1 envelope", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers", { method: "GET" }),
      makeDeps(),
      "/v1/providers",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; items: unknown[] };
    expect(body._v).toBe(1);
    expect(Array.isArray(body.items)).toBe(true);
  });
});
