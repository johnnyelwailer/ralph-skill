import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/sqlite-db";
import { loadBundledMigrations } from "@aloop/sqlite-db";
import { ProjectRegistry } from "./projects.ts";
import { WorkspaceRegistry } from "./workspaces.ts";
import { PermitRegistry, projectGrantedPermit } from "./permits.ts";
import { SessionRegistry } from "./sessions-registry.ts";
import type { StateStore } from "@aloop/core/src/adapters/state.ts";

function createSqliteStateStore(dbPath: string): StateStore {
  const { db } = openDatabase(dbPath);
  loadBundledMigrations(db);

  const projectRegistry = new ProjectRegistry(db);
  const workspaceRegistry = new WorkspaceRegistry(db);
  const permitRegistry = new PermitRegistry(db);
  const sessionRegistry = new SessionRegistry(db);

  const store: StateStore = {
    workspace: {
      create: async (input) => {
        return workspaceRegistry.create(input);
      },
      get: async (id) => {
        return workspaceRegistry.get(id) ?? undefined;
      },
      list: async (filter) => {
        return workspaceRegistry.list(filter ?? {});
      },
      archive: async (id) => {
        workspaceRegistry.archive(id);
      },
    },
    project: {
      create: async (input) => {
        return projectRegistry.create(input);
      },
      get: async (id) => {
        return projectRegistry.get(id) ?? undefined;
      },
      getByPath: async (absPath) => {
        return projectRegistry.getByPath(absPath) ?? undefined;
      },
      list: async (filter) => {
        return projectRegistry.list(filter ?? {});
      },
      updateStatus: async (id, status) => {
        projectRegistry.updateStatus(id, status);
      },
      touchActivity: async (id) => {
        projectRegistry.touchActivity(id);
      },
      archive: async (id) => {
        projectRegistry.archive(id);
      },
      purge: async (id) => {
        projectRegistry.purge(id);
      },
      addWorkspace: async (projectId, workspaceId, role) => {
        projectRegistry.addWorkspace(projectId, workspaceId, role);
      },
      removeWorkspace: async (projectId, workspaceId) => {
        projectRegistry.removeWorkspace(projectId, workspaceId);
      },
    },
    session: {
      create: async (input) => {
        return sessionRegistry.create(input);
      },
      get: async (id) => {
        return sessionRegistry.get(id) ?? undefined;
      },
      list: async (filter) => {
        return sessionRegistry.list(filter ?? {});
      },
      updateStatus: async (id, status) => {
        sessionRegistry.updateStatus(id, status);
      },
      archive: async (id) => {
        sessionRegistry.archive(id);
      },
    },
    permit: {
      grant: async (input) => {
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
        projectGrantedPermit(db, {
          permitId: input.permitId,
          sessionId: input.sessionId ?? null,
          composerTurnId: input.composerTurnId ?? null,
          controlSubagentRunId: input.controlSubagentRunId ?? null,
          projectId: input.projectId ?? null,
          providerId: input.providerId,
          ttlSeconds: input.ttlSeconds,
          grantedAt: now,
          expiresAt,
        });
      },
      revoke: async (permitId) => {
        db.run(`DELETE FROM permits WHERE id = ?`, [permitId]);
      },
      listActive: async () => {
        return permitRegistry.list();
      },
      listExpired: async (nowIso) => {
        return permitRegistry.listExpired(nowIso);
      },
      countActive: async () => {
        return permitRegistry.countActive();
      },
      countByProject: async (projectId) => {
        return permitRegistry.countByProject(projectId);
      },
    },
    providerHealth: {
      upsert: async () => {
        // Provider health not yet fully wired in state-sqlite
      },
      get: async () => {
        return undefined;
      },
      list: async () => {
        return [];
      },
      applyFailure: async () => {
        // Provider health not yet fully wired in state-sqlite
      },
    },
    metrics: {
      recordEvent: async () => {
        // Metrics recording not yet fully wired in state-sqlite
      },
      getSessionMetrics: async () => {
        return { concurrencyInFlight: 0, permitsActive: 0, updatedAt: new Date().toISOString() };
      },
    },
  };

  return store;
}

describe("StateStore SQLite implementation", () => {
  let dir: string;
  let store: StateStore;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-state-store-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    store = createSqliteStateStore(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("workspace sub-store", () => {
    test("create and get a workspace", async () => {
      const ws = await store.workspace.create({ name: "Test Workspace", description: "A test workspace" });
      expect(ws.name).toBe("Test Workspace");
      expect(ws.description).toBe("A test workspace");

      const found = await store.workspace.get(ws.id);
      expect(found?.id).toBe(ws.id);
      expect(found?.name).toBe("Test Workspace");
    });

    test("list workspaces", async () => {
      await store.workspace.create({ name: "WS 1" });
      await store.workspace.create({ name: "WS 2" });
      const result = await store.workspace.list();
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    test("archive a workspace", async () => {
      const ws = await store.workspace.create({ name: "Archive Me" });
      await store.workspace.archive(ws.id);
      const found = await store.workspace.get(ws.id);
      expect(found?.archivedAt).not.toBeNull();
    });
  });

  describe("project sub-store", () => {
    test("create and get a project", async () => {
      const project = await store.project.create({ absPath: "/tmp/test-project" });
      expect(project.absPath).toBe("/tmp/test-project");

      const found = await store.project.get(project.id);
      expect(found?.id).toBe(project.id);
    });

    test("getByPath returns correct project", async () => {
      await store.project.create({ absPath: "/tmp/path-test" });
      const found = await store.project.getByPath("/tmp/path-test");
      expect(found?.absPath).toBe("/tmp/path-test");
    });

    test("updateStatus transitions project status", async () => {
      const project = await store.project.create({ absPath: "/tmp/status-test" });
      expect(project.status).toBe("setup_pending");

      await store.project.updateStatus(project.id, "ready");
      const updated = await store.project.get(project.id);
      expect(updated?.status).toBe("ready");
    });

    test("archive and purge project", async () => {
      const project = await store.project.create({ absPath: "/tmp/arcpurge" });
      await store.project.archive(project.id);
      let found = await store.project.get(project.id);
      expect(found?.status).toBe("archived");

      await store.project.purge(project.id);
      found = await store.project.get(project.id);
      expect(found).toBeUndefined();
    });
  });

  describe("session sub-store", () => {
    test("create and get a session", async () => {
      const project = await store.project.create({ absPath: "/tmp/session-test" });
      const session = await store.session.create({
        projectId: project.id,
        kind: "standalone",
        workflow: "plan-build-review",
        providerChain: ["opencode"],
      });
      expect(session.projectId).toBe(project.id);
      expect(session.kind).toBe("standalone");
      expect(session.status).toBe("pending");

      const found = await store.session.get(session.id);
      expect(found?.id).toBe(session.id);
    });

    test("updateStatus transitions session status", async () => {
      const project = await store.project.create({ absPath: "/tmp/sess-status" });
      const session = await store.session.create({
        projectId: project.id,
        kind: "child",
        workflow: "plan-build-review",
        providerChain: ["opencode"],
      });

      await store.session.updateStatus(session.id, "running");
      const updated = await store.session.get(session.id);
      expect(updated?.status).toBe("running");
    });
  });

  describe("permit sub-store", () => {
    test("grant and list active permits with session_id", async () => {
      const project = await store.project.create({ absPath: "/tmp/permit-test" });
      const session = await store.session.create({
        projectId: project.id,
        kind: "standalone",
        workflow: "plan-build-review",
        providerChain: ["opencode"],
      });

      await store.permit.grant({
        permitId: "permit-1",
        sessionId: session.id,
        providerId: "opencode",
        ttlSeconds: 600,
      });

      const active = await store.permit.listActive();
      expect(active.some((p) => p.id === "permit-1")).toBe(true);
    });

    test("revoke removes permit", async () => {
      const project = await store.project.create({ absPath: "/tmp/revoke-test" });
      const session = await store.session.create({
        projectId: project.id,
        kind: "standalone",
        workflow: "plan-build-review",
        providerChain: ["opencode"],
      });

      await store.permit.grant({
        permitId: "permit-revoke",
        sessionId: session.id,
        providerId: "opencode",
        ttlSeconds: 600,
      });

      await store.permit.revoke("permit-revoke");
      const active = await store.permit.listActive();
      expect(active.some((p) => p.id === "permit-revoke")).toBe(false);
    });

    test("countActive returns correct count", async () => {
      const project = await store.project.create({ absPath: "/tmp/count-test" });
      const session1 = await store.session.create({
        projectId: project.id,
        kind: "standalone",
        workflow: "plan-build-review",
        providerChain: ["opencode"],
      });
      const session2 = await store.session.create({
        projectId: project.id,
        kind: "standalone",
        workflow: "plan-build-review",
        providerChain: ["opencode"],
      });

      await store.permit.grant({ permitId: "c1", sessionId: session1.id, providerId: "opencode", ttlSeconds: 600 });
      await store.permit.grant({ permitId: "c2", sessionId: session2.id, providerId: "copilot", ttlSeconds: 600 });

      const count = await store.permit.countActive();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });
});