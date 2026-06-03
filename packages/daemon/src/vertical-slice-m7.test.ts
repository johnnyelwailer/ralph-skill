import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { startDaemon, type RunningDaemon } from "./daemon/start.ts";

/**
 * Vertical slice: M7 (thin) — daemon work-item projection + builtin tracker
 * adapter end-to-end.
 *
 * Spec: docs/spec/DELIVERY_PLAN.md §M7 — Daemon work-item projections +
 * builtin tracker adapter + first orchestrator slice.
 *
 * This thin slice wires every layer required to create, project, list, and
 * close work items through the daemon API while the builtin adapter writes
 * JSON files under the project root:
 *
 *   POST /v1/workspaces
 *   POST /v1/projects
 *   POST /v1/work-items (epic)        → adapter writes 0001.json; projection row
 *   POST /v1/work-items (story × 2)   → adapter writes 0002.json / 0003.json
 *   GET  /v1/work-items?project_id=…  → projection returns 3 items
 *   PATCH /v1/work-items/.../{key}    → state=closed; projection reflects
 *   GET  /v1/work-items?state=closed  → projection returns 1 closed item
 *
 * The orchestrator session and decompose+dispatch workflow is intentionally
 * deferred to a follow-up slice; see docs/spec/orchestrator.md. The data,
 * adapter, and projection layers (this slice) must be in place first.
 */

describe("M7 vertical slice — work items via builtin tracker", () => {
  let home: string;
  let projectDir: string;
  let daemon: RunningDaemon | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-m7-home-"));
    projectDir = join(home, "project");
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop().catch(() => {});
      daemon = undefined;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test(
    "create epic + 2 stories through /v1/work-items, observe on-disk + projection, close one",
    async () => {
      const paths = resolveDaemonPaths({ ALOOP_HOME: home });
      daemon = await startDaemon({ port: 0, paths });
      const base = `http://${daemon.http.hostname}:${daemon.http.port}`;

      // Workspace
      const ws = (await (await fetch(`${base}/v1/workspaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "m7-ws" }),
      })).json()) as { id: string };
      expect(ws.id).toBeTruthy();

      // Project
      const project = (await (await fetch(`${base}/v1/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          abs_path: projectDir,
          name: "m7-project",
          workspace_ids: [{ workspace_id: ws.id, role: "primary" }],
        }),
      })).json()) as { id: string; status: string };
      expect(project.id).toBeTruthy();

      // Create Epic
      const epicRes = await fetch(`${base}/v1/work-items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          kind: "epic",
          title: "Ship M7 work items",
          body: "Daemon projection + builtin adapter",
          status: "needs_refinement",
          labels: ["M7"],
        }),
      });
      expect(epicRes.status).toBe(201);
      const epic = (await epicRes.json()) as {
        id: string;
        tracker_id: string;
        ref_key: string;
        kind: string;
        state: string;
      };
      expect(epic.tracker_id).toBe("builtin");
      expect(epic.kind).toBe("epic");
      expect(epic.state).toBe("open");
      expect(epic.ref_key).toBe("0001");

      // Create two Stories under the Epic
      async function createStory(title: string, body: string): Promise<{ ref_key: string; id: string; parent_ref_key: string | null }> {
        const r = await fetch(`${base}/v1/work-items`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            kind: "story",
            title,
            body,
            status: "needs_refinement",
            parent_ref_key: epic.ref_key,
            parent_tracker: epic.tracker_id,
            labels: ["story"],
          }),
        });
        expect(r.status).toBe(201);
        return (await r.json()) as { ref_key: string; id: string; parent_ref_key: string | null };
      }
      const story1 = await createStory("Wire work_items table", "Migration + indexes");
      const story2 = await createStory("Wire builtin adapter into daemon", "Per-project root");
      expect(story1.parent_ref_key).toBe(epic.ref_key);
      expect(story2.parent_ref_key).toBe(epic.ref_key);

      // On-disk: builtin adapter wrote JSON files for all three
      const trackerRoot = join(paths.stateDir, "trackers", project.id, ".aloop", "tracker");
      expect(existsSync(trackerRoot)).toBe(true);
      const files = readdirSync(trackerRoot).filter((f) => f.endsWith(".json")).sort();
      expect(files).toEqual(["0001.json", "0002.json", "0003.json"]);

      // The on-disk Epic JSON has the correct title and kind
      const epicOnDisk = JSON.parse(readFileSync(join(trackerRoot, "0001.json"), "utf-8")) as {
        kind: string;
        title: string;
        labels: string[];
      };
      expect(epicOnDisk.kind).toBe("epic");
      expect(epicOnDisk.title).toBe("Ship M7 work items");
      expect(epicOnDisk.labels).toEqual(["M7"]);

      // The Stories link to the Epic
      const story1OnDisk = JSON.parse(readFileSync(join(trackerRoot, "0002.json"), "utf-8")) as {
        kind: string;
        links: { parent: { key: string } };
      };
      expect(story1OnDisk.kind).toBe("story");
      expect(story1OnDisk.links.parent.key).toBe(epic.ref_key);

      // Projection: GET /v1/work-items?project_id=... returns 3 items
      const listRes = await fetch(`${base}/v1/work-items?project_id=${project.id}`);
      expect(listRes.status).toBe(200);
      const listed = (await listRes.json()) as { items: Array<{ ref_key: string; kind: string }> };
      expect(listed.items.map((i) => i.ref_key).sort()).toEqual(["0001", "0002", "0003"]);

      // Filter by kind=epic
      const epicList = (await (await fetch(`${base}/v1/work-items?project_id=${project.id}&kind=epic`)).json()) as { items: Array<{ ref_key: string }> };
      expect(epicList.items.map((i) => i.ref_key)).toEqual([epic.ref_key]);

      // Filter by kind=story
      const storyList = (await (await fetch(`${base}/v1/work-items?project_id=${project.id}&kind=story`)).json()) as { items: Array<{ ref_key: string }> };
      expect(storyList.items.map((i) => i.ref_key).sort()).toEqual([story1.ref_key, story2.ref_key]);

      // GET by composite key
      const getRes = await fetch(`${base}/v1/work-items/${project.id}/builtin/${story1.ref_key}`);
      expect(getRes.status).toBe(200);
      const fetched = (await getRes.json()) as { ref_key: string; title: string };
      expect(fetched.ref_key).toBe(story1.ref_key);
      expect(fetched.title).toBe("Wire work_items table");

      // PATCH state=closed on the first story
      const closeRes = await fetch(`${base}/v1/work-items/${project.id}/builtin/${story1.ref_key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "closed", status: "done" }),
      });
      expect(closeRes.status).toBe(200);
      const closed = (await closeRes.json()) as { state: string; status: string; closed_at: string | null };
      expect(closed.state).toBe("closed");
      expect(closed.status).toBe("done");
      expect(closed.closed_at).not.toBeNull();

      // Filter by state=closed
      const closedList = (await (await fetch(`${base}/v1/work-items?project_id=${project.id}&state=closed`)).json()) as { items: Array<{ ref_key: string }> };
      expect(closedList.items.map((i) => i.ref_key)).toEqual([story1.ref_key]);

      // The on-disk file also reflects the closed state
      const story1After = JSON.parse(readFileSync(join(trackerRoot, "0002.json"), "utf-8")) as { state: string };
      expect(story1After.state).toBe("closed");
    },
    30_000,
  );

  test("rejects create for missing project with 404", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    daemon = await startDaemon({ port: 0, paths });
    const base = `http://${daemon.http.hostname}:${daemon.http.port}`;
    const res = await fetch(`${base}/v1/work-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "p_does_not_exist", kind: "epic", title: "x" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("project_not_found");
  });

  test("rejects create with missing required fields", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    daemon = await startDaemon({ port: 0, paths });
    const base = `http://${daemon.http.hostname}:${daemon.http.port}`;
    const ws = (await (await fetch(`${base}/v1/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "m7-ws-validate" }),
    })).json()) as { id: string };
    const project = (await (await fetch(`${base}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        abs_path: projectDir,
        workspace_ids: [{ workspace_id: ws.id, role: "primary" }],
      }),
    })).json()) as { id: string };

    // Missing title
    const r1 = await fetch(`${base}/v1/work-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: project.id, kind: "epic" }),
    });
    expect(r1.status).toBe(400);

    // Invalid kind
    const r2 = await fetch(`${base}/v1/work-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: project.id, kind: "bug", title: "x" }),
    });
    expect(r2.status).toBe(400);
  });
});
