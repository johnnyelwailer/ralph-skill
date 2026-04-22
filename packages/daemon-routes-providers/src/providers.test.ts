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

  test("GET /v1/providers returns 405 for non-GET", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers", { method: "POST" }),
      makeDeps(),
      "/v1/providers",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/providers/overrides ────────────────────────────────────────────────

describe("GET /v1/providers/overrides", () => {
  test("returns current overrides", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "GET" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: null; deny: null; force: null };
    expect(body._v).toBe(1);
  });
});

describe("DELETE /v1/providers/overrides", () => {
  test("resets overrides to defaults and returns them", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "DELETE" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: null; deny: null; force: null };
    expect(body._v).toBe(1);
    expect(body.allow).toBeNull();
  });

  test("DELETE is the only allowed mutation method on overrides", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "POST" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

describe("PUT /v1/providers/overrides", () => {
  test("accepts valid overrides", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allow: ["opencode", "codex"] }),
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: readonly string[] };
    expect(body._v).toBe(1);
    expect(body.allow).toEqual(["opencode", "codex"]);
  });

  test("rejects invalid overrides with 400", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allow: 42 }),
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 for malformed JSON body", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("PUT is the only allowed mutation method on overrides", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "PATCH" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/providers/resolve-chain ────────────────────────────────────────────

describe("POST /v1/providers/resolve-chain", () => {
  test("resolves provider chain and returns all fields", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "sess_abc", provider_chain: ["opencode"] }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      _v: number;
      session_id: string;
      input_chain: string[];
      resolved_chain: string[];
      excluded_overrides: string[];
      excluded_health: string[];
    };
    expect(body._v).toBe(1);
    expect(body.session_id).toBe("sess_abc");
    expect(body.input_chain).toEqual(["opencode"]);
    expect(Array.isArray(body.resolved_chain)).toBe(true);
  });

  test("uses all registered providers when chain is omitted", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "sess_xyz" }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { input_chain: unknown };
    expect(body.input_chain).toEqual([]);
  });

  test("returns 400 when session_id is missing", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider_chain: ["opencode"] }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when session_id is empty string", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "   " }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 for malformed JSON body", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 405 for non-POST methods", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", { method: "GET" }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});
