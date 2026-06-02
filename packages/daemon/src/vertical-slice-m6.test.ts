import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { startDaemon, type RunningDaemon } from "./daemon/start.ts";

/**
 * Vertical slice: M6 end-to-end smoke flow.
 *
 * Spec: docs/spec/DELIVERY_PLAN.md §M6 — Session runner + first workflow (quick-fix) + shims.
 * Acceptance: launch a session with the quick-fix workflow and opencode provider on a trivial
 * repo. Session runs plan→build→review, emits events live over SSE, ends with
 * status=completed or failed. JSONL replay reconstructs session state.
 *
 * This test wires every layer of the M6 vertical slice through the real HTTP API
 * (workspaces, projects, sessions, recompile, run-turn, SSE) and asserts that a
 * session driven by the bundled quick-fix.yaml workflow reaches a terminal status
 * while events stream on /v1/events and the JSONL log is replayable.
 */

type SseMessage = { id: string; event: string; data: string };

/**
 * Read SSE events from a stream until the predicate returns true, the timeout
 * fires, or the server closes the connection.  Returns parsed `id`/`event`/`data`
 * triples for every event that arrives.  Pass a `predicate` to short-circuit as
 * soon as the buffer contains the bytes you expect (faster than a fixed timeout).
 */
async function readSseFor(
  res: Response,
  ms: number,
  predicate?: (chunk: string) => boolean,
): Promise<SseMessage[]> {
  if (!res.body) return [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const out: SseMessage[] = [];
  const deadline = Date.now() + ms;
  let buf = "";
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const timeout = new Promise<{ value: undefined; done: true }>((r) =>
      setTimeout(() => r({ value: undefined, done: true }), remaining),
    );
    const read = reader.read();
    const next = await Promise.race([read, timeout]);
    if (next.done) {
      buf += decoder.decode();
      break;
    }
    buf += decoder.decode(next.value, { stream: true });
    if (predicate?.(buf)) {
      // Best-effort cancel; do not await — server may be blocked writing and
      // we don't want to hold the test open past the deadline.
      reader.cancel().catch(() => {});
      break;
    }
  }
  for (const block of buf.split("\n\n")) {
    if (!block.trim()) continue;
    let id = "";
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("id: ")) id = line.slice(4);
      else if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (id || event || data) out.push({ id, event, data });
  }
  return out;
}

/** Wait until predicate returns truthy or the timeout fires. */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  ms: number,
  intervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

describe("M6 vertical slice — end-to-end", () => {
  let home: string;
  let projectDir: string;
  let daemon: RunningDaemon | undefined;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "aloop-m6-home-"));
    projectDir = join(home, "project");
    mkdirSync(join(projectDir, "aloop", "templates"), { recursive: true });
    writeFileSync(
      join(projectDir, "aloop", "templates", "PROMPT_plan.md"),
      "Plan the fix for the issue described below.\n",
      "utf-8",
    );
    writeFileSync(
      join(projectDir, "aloop", "templates", "PROMPT_review.md"),
      "Review the plan and confirm it is sound.\n",
      "utf-8",
    );

    const workflowsDir = join(home, "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(
      join(workflowsDir, "quick-fix.yaml"),
      "pipeline:\n  - agent: plan\n  - agent: review\n",
      "utf-8",
    );
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop().catch(() => {});
      daemon = undefined;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test(
    "register workspace+project, run quick-fix session, stream events, complete cycle",
    async () => {
      const fakeRunTurn = async (): Promise<{
        ok: true;
        text: string;
        usage: { tokensIn: number; tokensOut: number; costUsd: number };
      }> => ({
        ok: true,
        text: "session-text-chunk",
        usage: { tokensIn: 3, tokensOut: 4, costUsd: 0.01 },
      });

      const paths = resolveDaemonPaths({ ALOOP_HOME: home });
      daemon = await startDaemon({
        port: 0,
        paths,
        opencodeSdkRunTurn: fakeRunTurn,
        opencodeCliRunTurn: fakeRunTurn,
      });
      const base = `http://${daemon.http.hostname}:${daemon.http.port}`;

      // 1. Create workspace
      const wsRes = await fetch(`${base}/v1/workspaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "m6-ws", description: "vertical slice workspace" }),
      });
      expect(wsRes.status).toBe(201);
      const ws = (await wsRes.json()) as { id: string; name: string };
      expect(ws.name).toBe("m6-ws");

      // 2. Register project
      const projRes = await fetch(`${base}/v1/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          abs_path: projectDir,
          name: "m6-project",
          workspace_ids: [{ workspace_id: ws.id, role: "primary" }],
        }),
      });
      expect(projRes.status).toBe(201);
      const project = (await projRes.json()) as { id: string; status: string };
      expect(project.status).toBe("setup_pending");

      // 3. Create a session with the quick-fix workflow
      const sessRes = await fetch(`${base}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          kind: "standalone",
          workflow: "quick-fix",
          provider_chain: ["opencode"],
        }),
      });
      expect(sessRes.status).toBe(201);
      const session = (await sessRes.json()) as {
        id: string;
        workflow: string;
        status: string;
        provider_chain: string[];
      };
      expect(session.workflow).toBe("quick-fix");
      expect(session.status).toBe("pending");
      expect(session.provider_chain).toEqual(["opencode"]);

      // 4. Subscribe to events for the future session BEFORE running the turn
      //    so we observe events as they are emitted.  Reading stops as soon as
      //    the expected lifecycle topics have been seen OR the timeout fires.
      const eventsRes = await fetch(`${base}/v1/events`);
      expect(eventsRes.status).toBe(200);
      expect(eventsRes.headers.get("content-type")).toBe("text/event-stream");
      const expectedTopics = ["session.event", "session.turn.started", "session.workflow_plan.updated"];
      const eventsPromise = readSseFor(
        eventsRes,
        3000,
        (chunk) => expectedTopics.every((t) => chunk.includes(`event: ${t}`)),
      );

      // 5. Compile the workflow plan
      const recompileRes = await fetch(`${base}/v1/sessions/${session.id}/recompile`, {
        method: "POST",
      });
      expect(recompileRes.status).toBe(200);
      const recompile = (await recompileRes.json()) as { workflow_plan_version: number };
      expect(recompile.workflow_plan_version).toBeGreaterThan(0);

      const planPath = join(paths.stateDir, "sessions", session.id, "workflow-plan.json");
      expect(existsSync(planPath)).toBe(true);
      const plan = JSON.parse(readFileSync(planPath, "utf-8")) as {
        workflow: string;
        handlers: { start: { pipeline: Array<{ kind: string; ref: string }> } };
      };
      expect(plan.workflow).toBe("quick-fix");
      expect(plan.handlers.start.pipeline.length).toBe(2);
      expect(plan.handlers.start.pipeline[0]!.ref).toBe("PROMPT_plan.md");
      expect(plan.handlers.start.pipeline[1]!.ref).toBe("PROMPT_review.md");

      // 6. Run a turn. The pipeline has 2 steps; the first turn will execute
      //    PROMPT_plan.md and advance currentPhase to PROMPT_review.md.
      const runRes = await fetch(`${base}/v1/sessions/${session.id}/run-turn`, {
        method: "POST",
      });
      expect(runRes.status).toBe(200);
      expect(runRes.headers.get("content-type")).toBe("text/event-stream");
      const turnSse = await readSseFor(runRes, 1500);
      const turnTypes = turnSse
        .map((m) => {
          try {
            return (JSON.parse(m.data) as { type?: string }).type ?? null;
          } catch {
            return null;
          }
        })
        .filter((t): t is string => t !== null);
      expect(turnTypes[0]).toBe("start");
      expect(turnTypes).toContain("text");
      expect(turnTypes).toContain("usage");
      const endEvent = turnTypes[turnTypes.length - 1];
      expect(endEvent).toBe("end");

      // 7. Session should be in 'running' state (one turn done, one remaining)
      const after1 = (await (await fetch(`${base}/v1/sessions/${session.id}`)).json()) as {
        status: string;
        current_phase: string | null;
      };
      expect(after1.status).toBe("running");
      expect(after1.current_phase).toBe("PROMPT_review.md");

      // 8. Run the second turn — completes the pipeline
      const run2Res = await fetch(`${base}/v1/sessions/${session.id}/run-turn`, {
        method: "POST",
      });
      expect(run2Res.status).toBe(200);
      await readSseFor(run2Res, 1500);

      // 9. Session should now be completed
      const reached = await waitFor(async () => {
        const r = await fetch(`${base}/v1/sessions/${session.id}`);
        const b = (await r.json()) as { status: string };
        return b.status === "completed";
      }, 3000);
      expect(reached).toBe(true);

      const final = (await (await fetch(`${base}/v1/sessions/${session.id}`)).json()) as {
        status: string;
        current_phase: string | null;
      };
      expect(final.status).toBe("completed");

      // 10. Drain the events stream and assert that we observed at least the
      //     session lifecycle events for this session.
      const events = await eventsPromise;
      const sessionEvents = events.filter((e) => {
        try {
          const payload = JSON.parse(e.data) as { data?: { session_id?: string } };
          return payload.data?.session_id === session.id;
        } catch {
          return false;
        }
      });
      const topics = new Set(sessionEvents.map((e) => e.event));
      expect(topics.has("session.event")).toBe(true);
      expect(topics.has("session.turn.started")).toBe(true);
      expect(topics.has("session.workflow_plan.updated")).toBe(true);

      // 11. JSONL log is replayable and contains the session lifecycle.
      const logPath = paths.logFile;
      expect(existsSync(logPath)).toBe(true);
      const logLines = readFileSync(logPath, "utf-8")
        .split("\n")
        .filter((line) => line.trim().length > 0);
      const ids = new Set<string>();
      for (const line of logLines) {
        try {
          const env = JSON.parse(line) as { id: string; data: { session_id?: string } };
          if (env.data.session_id === session.id) ids.add(env.id);
        } catch {
          // ignore malformed lines (matches JsonlEventStore tolerance)
        }
      }
      // Replay reconstructs enough ids for the session to be identifiable.
      expect(ids.size).toBeGreaterThan(0);
    },
    30_000,
  );

  test("rejects run-turn when the workflow has not been compiled", async () => {
    const fakeRunTurn = async (): Promise<{
      ok: true;
      text: string;
      usage: { tokensIn: number; tokensOut: number; costUsd: number };
    }> => ({ ok: true, text: "x", usage: { tokensIn: 1, tokensOut: 1, costUsd: 0 } });
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    daemon = await startDaemon({
      port: 0,
      paths,
      opencodeSdkRunTurn: fakeRunTurn,
      opencodeCliRunTurn: fakeRunTurn,
    });
    const base = `http://${daemon.http.hostname}:${daemon.http.port}`;

    const ws = (await (await fetch(`${base}/v1/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "m6-ws-2" }),
    })).json()) as { id: string };
    const project = (await (await fetch(`${base}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: projectDir, workspace_ids: [{ workspace_id: ws.id, role: "primary" }] }),
    })).json()) as { id: string };
    const session = (await (await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: project.id, workflow: "quick-fix", provider_chain: ["opencode"] }),
    })).json()) as { id: string };

    const res = await fetch(`${base}/v1/sessions/${session.id}/run-turn`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("workflow_plan_missing");
  });
});
