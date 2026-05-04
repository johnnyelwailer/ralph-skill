export type RouterDeps = {
  readonly handleDaemon: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleMetrics: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleMetricsAggregates: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleProjects: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleProviders: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleScheduler: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleSessions: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleArtifacts: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  readonly handleTurns: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  /** SSE event bus: GET /v1/events */
  readonly handleEvents: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  /** Setup runs: /v1/setup/runs */
  readonly handleSetup: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  /** Workspaces: /v1/workspaces */
  readonly handleWorkspaces: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  /** Triggers: /v1/triggers */
  readonly handleTriggers: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  /** Incubation: /v1/incubation/* */
  readonly handleIncubation: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
  /** Composer: /v1/composer/* */
  readonly handleComposer: (
    req: Request,
    pathname: string,
  ) => Response | Promise<Response | undefined> | undefined;
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

    const daemonResponse = await deps.handleDaemon(req, pathname);
    if (daemonResponse) return daemonResponse;

    const metricsResponse = await deps.handleMetrics(req, pathname);
    if (metricsResponse) return metricsResponse;

    const metricsAggregatesResponse = await deps.handleMetricsAggregates(req, pathname);
    if (metricsAggregatesResponse) return metricsAggregatesResponse;

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

    const projectsResponse = await deps.handleProjects(req, pathname);
    if (projectsResponse) return projectsResponse;

    const providersResponse = await deps.handleProviders(req, pathname);
    if (providersResponse) return providersResponse;

    const schedulerResponse = await deps.handleScheduler(req, pathname);
    if (schedulerResponse) return schedulerResponse;

    const sessionsResponse = await deps.handleSessions(req, pathname);
    if (sessionsResponse) return sessionsResponse;

    const artifactsResponse = await deps.handleArtifacts(req, pathname);
    if (artifactsResponse) return artifactsResponse;

    const turnsResponse = await deps.handleTurns(req, pathname);
    if (turnsResponse) return turnsResponse;

    const eventsResponse = await deps.handleEvents(req, pathname);
    if (eventsResponse) return eventsResponse;

    const setupResponse = await deps.handleSetup(req, pathname);
    if (setupResponse) return setupResponse;

    const workspacesResponse = await deps.handleWorkspaces(req, pathname);
    if (workspacesResponse) return workspacesResponse;

    const triggersResponse = await deps.handleTriggers(req, pathname);
    if (triggersResponse) return triggersResponse;

    const incubationResponse = await deps.handleIncubation(req, pathname);
    if (incubationResponse) return incubationResponse;

    const composerResponse = await deps.handleComposer(req, pathname);
    if (composerResponse) return composerResponse;

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
