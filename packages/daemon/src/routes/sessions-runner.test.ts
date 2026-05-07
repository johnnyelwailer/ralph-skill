import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../daemon/start.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";

describe("session runner integration", () => {
  let home: string;
  let projectDir: string;
  let daemon: RunningDaemon | undefined;
  let baseUrl: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-runner-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "aloop-runner-project-"));
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop().catch(() => {});
      daemon = undefined;
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("creates a session, compiles loop-plan.json, and persists replayable agent chunks", async () => {
    await Bun.write(join(projectDir, "aloop", "pipeline.yml"), `pipeline:\n  - agent: plan\n  - agent: review\n`);

    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
      dbPath: ":memory:",
      opencodeSdkRunTurn: async ({ prompt }) => ({
        ok: true,
        text: `stubbed: ${prompt.split("\n")[0] ?? ""}`,
        usage: { tokensIn: 3, tokensOut: 5, costUsd: 0.01 },
      }),
    });
    baseUrl = `http://${daemon.http.hostname}:${daemon.http.port}`;

    const createdProject = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: projectDir, name: "runner-fixture" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const createdSession = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: createdProject.id }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const session = await waitForTerminalSession(baseUrl, createdSession.id);
    expect(session.status).toBe("completed");

    const sessionDir = join(daemon.paths.stateDir, "sessions", createdSession.id);
    const loopPlanPath = join(sessionDir, "loop-plan.json");
    expect(existsSync(loopPlanPath)).toBe(true);
    const loopPlan = JSON.parse(readFileSync(loopPlanPath, "utf-8")) as { cycle: unknown[]; cyclePosition: number };
    expect(loopPlan.cycle).toHaveLength(2);
    expect(loopPlan.cyclePosition).toBe(2);

    const logResponse = await fetch(`${baseUrl}/v1/sessions/${createdSession.id}/log?format=jsonl`);
    expect(logResponse.status).toBe(200);
    const lines = (await logResponse.text()).trim().split("\n").filter(Boolean);
    const envelopes = lines.map((line) => JSON.parse(line) as { topic: string; data: Record<string, unknown> });
    const chunkEvents = envelopes.filter((event) => event.topic === "agent.chunk");
    expect(chunkEvents.length).toBeGreaterThanOrEqual(4);
    expect(chunkEvents.some((event) => event.data.turn_id)).toBe(true);
    expect(chunkEvents.some((event) => event.data.type === "usage")).toBe(true);
  });

  test("runs a shipped workflow when session.workflow is provided", async () => {
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
      dbPath: ":memory:",
      opencodeSdkRunTurn: async ({ prompt }) => ({
        ok: true,
        text: `workflow: ${prompt.split("\n")[0] ?? ""}`,
        usage: { tokensIn: 2, tokensOut: 4, costUsd: 0.02 },
      }),
    });
    baseUrl = `http://${daemon.http.hostname}:${daemon.http.port}`;

    const createdProject = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: projectDir, name: "workflow-fixture" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const createdSession = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: createdProject.id, workflow: "quick-fix" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const session = await waitForTerminalSession(baseUrl, createdSession.id);
    expect(session.status).toBe("completed");

    const sessionDir = join(daemon.paths.stateDir, "sessions", createdSession.id);
    const loopPlan = JSON.parse(readFileSync(join(sessionDir, "loop-plan.json"), "utf-8")) as { cycle: unknown[] };
    expect(loopPlan.cycle).toHaveLength(2);
  });
});

async function waitForTerminalSession(
  baseUrl: string,
  sessionId: string,
): Promise<{ status: string }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const session = await fetch(`${baseUrl}/v1/sessions/${sessionId}`).then(
      (response) => response.json() as Promise<{ status: string }>,
    );
    if (session.status === "completed" || session.status === "failed") {
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`session did not reach terminal status: ${sessionId}`);
}