import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleProviders, type ProvidersDeps } from "./providers.ts";
import type { EventWriter } from "@aloop/state-sqlite";
import type { ConfigStore } from "@aloop/daemon-config";
import { OVERRIDES_DEFAULT } from "@aloop/daemon-config";

const PATH = "/v1/providers/overrides";

function makeConfigStore(initial = OVERRIDES_DEFAULT): ConfigStore {
  let value = { ...initial };
  return {
    overrides() {
      return value;
    },
    setOverrides(v) {
      value = { ...v };
    },
  };
}

function makeEventWriter(): EventWriter & { appended: unknown[] } {
  const appended: unknown[] = [];
  return {
    appended,
    async append(topic, data) {
      appended.push({ topic, data });
      // Return a minimal envelope shape so callers that read `event.topic` don't crash.
      return { topic, data, id: "test-id", ts: 0 };
    },
  };
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost${PATH}`, {
    method,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  });
}

describe("handleProviders", () => {
  describe("path mismatch", () => {
    test("returns undefined for unrelated pathname", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const req = makeRequest("GET");
      // Pretend this is a different route by passing a non-matching pathname.
      const result = await handleProviders(req, deps, "/v1/something/else");
      expect(result).toBeUndefined();
    });
  });

  describe("GET /v1/providers/overrides", () => {
    test("returns current overrides with _v envelope", async () => {
      const custom = { allow: ["provider_a"], deny: null, force: null };
      const config = makeConfigStore(custom);
      const deps = { config, events: makeEventWriter() };
      const result = await handleProviders(makeRequest("GET"), deps, PATH);
      expect(result!.status).toBe(200);
      const body = await result!.json();
      expect(body).toEqual({ _v: 1, ...custom });
    });

    test("returns all-null defaults when no overrides set", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(makeRequest("GET"), deps, PATH);
      expect(result!.status).toBe(200);
      const body = await result!.json();
      expect(body).toEqual({ _v: 1, ...OVERRIDES_DEFAULT });
    });
  });

  describe("DELETE /v1/providers/overrides", () => {
    test("resets overrides to defaults and returns them", async () => {
      const custom = { allow: ["x"], deny: ["y"], force: "z" };
      const config = makeConfigStore(custom);
      const events = makeEventWriter();
      const deps = { config, events };
      const result = await handleProviders(makeRequest("DELETE"), deps, PATH);
      expect(result!.status).toBe(200);
      const body = await result!.json();
      expect(body).toEqual({ _v: 1, ...OVERRIDES_DEFAULT });
      expect(config.overrides()).toEqual(OVERRIDES_DEFAULT);
    });

    test("emits provider.override.changed event with defaults", async () => {
      const custom = { allow: ["x"], deny: null, force: null };
      const config = makeConfigStore(custom);
      const events = makeEventWriter();
      const deps = { config, events };
      await handleProviders(makeRequest("DELETE"), deps, PATH);
      expect(events.appended).toHaveLength(1);
      expect(events.appended[0]).toMatchObject({
        topic: "provider.override.changed",
        data: OVERRIDES_DEFAULT,
      });
    });
  });

  describe("PUT /v1/providers/overrides", () => {
    test("accepts valid overrides and persists them", async () => {
      const config = makeConfigStore();
      const events = makeEventWriter();
      const deps = { config, events };
      const overrides = { allow: ["opencode", "codex"], deny: null, force: null };
      const result = await handleProviders(
        makeRequest("PUT", overrides),
        deps,
        PATH,
      );
      expect(result!.status).toBe(200);
      const body = await result!.json();
      expect(body).toEqual({ _v: 1, ...overrides });
      expect(config.overrides()).toEqual(overrides);
    });

    test("emits provider.override.changed event on valid PUT", async () => {
      const config = makeConfigStore();
      const events = makeEventWriter();
      const deps = { config, events };
      const overrides = { allow: null, deny: ["bad"], force: "good" };
      await handleProviders(makeRequest("PUT", overrides), deps, PATH);
      expect(events.appended).toHaveLength(1);
      expect(events.appended[0]).toMatchObject({
        topic: "provider.override.changed",
        data: overrides,
      });
    });

    test("returns 400 when body is not a JSON object", async () => {
      const deps = {
        config: makeConfigStore(),
        events: makeEventWriter(),
      };
      const badReq = new Request(`http://localhost${PATH}`, {
        method: "PUT",
        body: "not json at all",
        headers: { "content-type": "application/json" },
      });
      const result = await handleProviders(badReq, deps, PATH);
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 when allow is not an array", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(
        makeRequest("PUT", { allow: "not-an-array" }),
        deps,
        PATH,
      );
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 when allow contains non-string entries", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(
        makeRequest("PUT", { allow: ["valid", 123, "also valid"] }),
        deps,
        PATH,
      );
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
      expect(body.error.details.errors).toContainEqual(
        expect.stringContaining("allow"),
      );
    });

    test("returns 400 when force is not a string", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(
        makeRequest("PUT", { force: 42 }),
        deps,
        PATH,
      );
      expect(result!.status).toBe(400);
    });

    test("returns 400 when force is an empty string", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(
        makeRequest("PUT", { force: "" }),
        deps,
        PATH,
      );
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 for deny list containing an empty string", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(
        makeRequest("PUT", { deny: ["provider_a", ""] }),
        deps,
        PATH,
      );
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
      expect(body.error.details.errors).toContainEqual(
        expect.stringContaining("deny"),
      );
    });

    test("returns 400 when body is null JSON value", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const badReq = new Request(`http://localhost${PATH}`, {
        method: "PUT",
        body: "null",
        headers: { "content-type": "application/json" },
      });
      const result = await handleProviders(badReq, deps, PATH);
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
      expect(body.error.message).toBe("request body must be a JSON object");
    });

    test("returns 400 when body is an array", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const badReq = new Request(`http://localhost${PATH}`, {
        method: "PUT",
        body: JSON.stringify(["not", "an", "object"]),
        headers: { "content-type": "application/json" },
      });
      const result = await handleProviders(badReq, deps, PATH);
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 for unknown top-level field", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(
        makeRequest("PUT", { allow: null, unknown_field: true }),
        deps,
        PATH,
      );
      expect(result!.status).toBe(400);
      const body = await result!.json();
      expect(body.error.details.errors).toContainEqual(
        expect.stringContaining("unknown"),
      );
    });

    test("does not emit event when validation fails", async () => {
      const events = makeEventWriter();
      const deps = { config: makeConfigStore(), events };
      await handleProviders(
        makeRequest("PUT", { allow: 123 }),
        deps,
        PATH,
      );
      expect(events.appended).toHaveLength(0);
    });
  });

  describe("method not allowed", () => {
    test("returns 405 for POST", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(makeRequest("POST"), deps, PATH);
      expect(result!.status).toBe(405);
      const body = await result!.json();
      expect(body.error.code).toBe("method_not_allowed");
    });

    test("returns 405 for PATCH", async () => {
      const deps = { config: makeConfigStore(), events: makeEventWriter() };
      const result = await handleProviders(makeRequest("PATCH"), deps, PATH);
      expect(result!.status).toBe(405);
    });
  });
});
