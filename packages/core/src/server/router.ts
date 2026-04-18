import { buildHealth } from "../routes/health.ts";
import { handleProjects } from "../routes/projects.ts";
import type { ProjectRegistry } from "../state/projects.ts";

export type RouterDeps = {
  readonly startedAt: number;
  readonly registry: ProjectRegistry;
};

/**
 * Route handler shared by HTTP and Unix socket transports. Returns a Response
 * for the given Request; transport-agnostic.
 */
export function makeFetchHandler(
  deps: RouterDeps,
): (req: Request) => Response | Promise<Response> {
  return async (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/v1/daemon/health") {
      const body = buildHealth(deps.startedAt);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "GET" && pathname === "/v1/events/echo") {
      // SSE echo scaffold — proves the transport works. Real event bus is M2+.
      return new Response(makeEchoStream(), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
        },
      });
    }

    const projectsResponse = await handleProjects(req, { registry: deps.registry }, pathname);
    if (projectsResponse) return projectsResponse;

    return new Response(
      JSON.stringify({
        error: {
          _v: 1,
          code: "not_found",
          message: `No route: ${req.method} ${pathname}`,
        },
      }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    );
  };
}

function makeEchoStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const write = (event: string, data: unknown): void => {
        const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };
      write("hello", { _v: 1, message: "sse scaffold alive" });
      write("ping", { _v: 1, ts: Date.now() });
      controller.close();
    },
  });
}
