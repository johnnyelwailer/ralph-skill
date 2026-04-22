import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  PermitRegistry,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import { SchedulerService, type SchedulerConfigView } from "@aloop/scheduler";
import { makeFetchHandler } from "./router.ts";

function makeDeps() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const schedulerConfig: SchedulerConfigView = {
    scheduler: () => ({
      concurrencyCap: 3,
      permitTtlDefaultSeconds: 600,
      permitTtlMaxSeconds: 3600,
      systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
      burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
    }),
    overrides: () => ({ allow: null, deny: null, force: null }),
    updateLimits: async () => ({
      ok: true,
      limits: {
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 600,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
      },
    }),
  };
  return {
    registry: new ProjectRegistry(db),
    scheduler: new SchedulerService(new PermitRegistry(db), schedulerConfig, {
      append: async (topic, data) => ({
        _v: 1,
        id: `evt_${crypto.randomUUID()}`,
        topic,
        data,
        timestamp: new Date().toISOString(),
      }),
    }),
    handleDaemon: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/daemon/health") return undefined;
      return new Response(JSON.stringify({ _v: 1, status: "ok", uptime_seconds: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    handleProviders: () => undefined,
  };
}

describe("makeFetchHandler (unit)", () => {
  test("dispatches /v1/daemon/health to the daemon route callback", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/daemon/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { _v: number; status: string };
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
  });

  test("dispatches /v1/projects to the projects route module", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/projects"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  test("returns SSE response for /v1/events/echo", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/events/echo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
  });

  test("SSE echo streams exactly two events: hello then ping", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/events/echo"));
    expect(res.status).toBe(200);
    const text = await res.text();

    // The SSE format is: "event: <name>\ndata: <json>\n\n"
    const lines = text.split("\n");
    const events: { event: string; data: unknown }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.startsWith("event: ")) {
        const eventName = lines[i]!.slice("event: ".length);
        const dataLine = lines[i + 1] ?? "";
        const dataStr = dataLine.startsWith("data: ") ? dataLine.slice("data: ".length) : "";
        events.push({ event: eventName, data: JSON.parse(dataStr) });
        i++; // skip the data line we just consumed
      }
    }

    expect(events).toHaveLength(2);
    expect(events[0]!.event).toBe("hello");
    expect(events[0]!.data).toMatchObject({ _v: 1, message: "sse scaffold alive" });

    expect(events[1]!.event).toBe("ping");
    expect(events[1]!.data).toMatchObject({ _v: 1 });
    expect(typeof (events[1]!.data as { ts: number }).ts).toBe("number");
  });

  test("SSE echo ping event contains a unix timestamp", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/events/echo"));
    expect(res.status).toBe(200);
    const text = await res.text();

    const pingLineIdx = text.split("\n").findIndex((l) => l === "event: ping");
    expect(pingLineIdx).toBeGreaterThan(-1);
    const dataLine = text.split("\n")[pingLineIdx + 1] ?? "";
    expect(dataLine).toStartWith("data: ");
    const ts = JSON.parse(dataLine.slice("data: ".length)).ts as number;
    // Timestamp should be a reasonable unix epoch milliseconds value
    expect(ts).toBeGreaterThan(1_000_000_000_000);
    expect(ts).toBeLessThan(10_000_000_000_000);
  });

  test("SSE stream closes after ping event (no infinite loop)", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/events/echo"));
    expect(res.status).toBe(200);
    const text = await res.text();
    // Should contain exactly two event blocks, then connection closes
    const eventCount = (text.match(/^event: /gm) ?? []).length;
    expect(eventCount).toBe(2);
    // Text should end with the trailing newline from the last `\n\n`
    expect(text).toMatch(/\n\n$/);
  });

  test("returns 404 envelope for unknown routes", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/unknown"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { _v: number; code: string; message: string } };
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/unknown");
  });

  test("404 envelope includes the request method in the message", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/missing", { method: "DELETE" }));
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("DELETE");
  });
});
