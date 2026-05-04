import { describe, expect, test } from "bun:test";
import { makeFetchHandler } from "./router.ts";

function makeDeps() {
  return {
    handleDaemon: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/daemon/health") return undefined;
      return new Response(JSON.stringify({ _v: 1, status: "ok", uptime_seconds: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    handleMetrics: () => undefined,
    handleMetricsAggregates: () => undefined,
    handleProjects: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/projects") return undefined;
      return new Response(JSON.stringify({ _v: 1, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    handleProviders: () => undefined,
    handleScheduler: () => undefined,
    handleSessions: () => undefined,
    handleArtifacts: () => undefined,
    handleTurns: () => undefined,
    handleEvents: () => undefined,
    handleSetup: () => undefined,
    handleWorkspaces: () => undefined,
    handleTriggers: () => undefined,
    handleIncubation: () => undefined,
    handleComposer: () => undefined,
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

  test("dispatches /v1/projects to the projects route callback", async () => {
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

// ─── makeFetchHandler — dispatch ordering and provider/project/scheduler routes ──

describe("makeFetchHandler dispatch order", () => {
  function makeDeps() {
    return {
      handleDaemon: (req: Request, pathname: string) => {
        if (pathname === "/v1/daemon/health") {
          return new Response(JSON.stringify({ _v: 1, handler: "daemon" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return undefined;
      },
      handleMetrics: () => undefined,
      handleMetricsAggregates: () => undefined,
      handleProjects: (req: Request, pathname: string) => {
        if (pathname === "/v1/projects") {
          return new Response(JSON.stringify({ _v: 1, handler: "projects" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return undefined;
      },
      handleProviders: (req: Request, pathname: string) => {
        if (pathname === "/v1/providers") {
          return new Response(JSON.stringify({ _v: 1, handler: "providers" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return undefined;
      },
      handleScheduler: (req: Request, pathname: string) => {
        if (pathname === "/v1/scheduler/limits") {
          return new Response(JSON.stringify({ _v: 1, handler: "scheduler" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return undefined;
      },
      handleSessions: () => undefined,
      handleArtifacts: () => undefined,
      handleTurns: () => undefined,
      handleEvents: () => undefined,
      handleSetup: () => undefined,
      handleWorkspaces: () => undefined,
      handleTriggers: () => undefined,
      handleIncubation: () => undefined,
      handleComposer: () => undefined,
    };
  }

  test("daemon route is checked first", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/daemon/health"));
    const body = await res.json() as { handler: string };
    expect(body.handler).toBe("daemon");
  });

  test("projects route is checked after daemon", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/projects"));
    const body = await res.json() as { handler: string };
    expect(body.handler).toBe("projects");
  });

  test("providers route is checked after projects", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/providers"));
    const body = await res.json() as { handler: string };
    expect(body.handler).toBe("providers");
  });

  test("scheduler route is checked before incubation (incubation is last)", async () => {
    // Incubation must be the last route checked — everything after it falls to 404.
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/scheduler/limits"));
    const body = await res.json() as { handler: string };
    expect(body.handler).toBe("scheduler");
  });

  test("handleIncubation is dispatched for /v1/incubation/* routes", async () => {
    const customDeps = makeDeps();
    customDeps.handleIncubation = (_req, pathname) => {
      if (pathname.startsWith("/v1/incubation/")) {
        return new Response(JSON.stringify({ _v: 1, handler: "incubation", pathname }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return undefined;
    };
    const fetch = makeFetchHandler(customDeps);
    const res = await fetch(new Request("http://x/v1/incubation/sessions"));
    expect(res.status).toBe(200);
    const body = await res.json() as { handler: string; pathname: string };
    expect(body.handler).toBe("incubation");
    expect(body.pathname).toBe("/v1/incubation/sessions");
  });

  test("handleIncubation is the last route checked (fallthrough after it = 404)", async () => {
    const customDeps = makeDeps();
    // Incubate explicitly returns undefined — no route should match after it
    const fetch = makeFetchHandler(customDeps);
    const res = await fetch(new Request("http://x/v1/incubation/any-path"));
    // handleIncubation returns undefined, so router falls through to 404
    expect(res.status).toBe(404);
  });

  test("unknown route falls through to 404 with not_found envelope", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/does-not-exist", { method: "GET" }));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { _v: number; code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/does-not-exist");
    expect(body.error._v).toBe(1);
  });

  test("POST request to /v1/projects is dispatched to projects handler", async () => {
    const customDeps = makeDeps();
    customDeps.handleProjects = (req) => {
      if (req.method === "POST") {
        return new Response(JSON.stringify({ _v: 1, handler: "projects", method: req.method }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return undefined;
    };
    const fetch = makeFetchHandler(customDeps);
    const res = await fetch(new Request("http://x/v1/projects", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { handler: string; method: string };
    expect(body.handler).toBe("projects");
    expect(body.method).toBe("POST");
  });

  test("PATCH request to /v1/projects/:id returns undefined (404 via router)", async () => {
    const fetch = makeFetchHandler(makeDeps());
    // projects handler returns undefined for this path — should 404
    const res = await fetch(new Request("http://x/v1/projects/some-id", { method: "PATCH" }));
    expect(res.status).toBe(404);
  });

  test("route handlers returning undefined results in 404", async () => {
    const fetch = makeFetchHandler(makeDeps());
    // /v1/daemon/config is not handled by any handler → 404
    const res = await fetch(new Request("http://x/v1/daemon/config", { method: "GET" }));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});
