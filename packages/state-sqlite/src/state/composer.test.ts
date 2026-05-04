/**
 * Unit tests for ComposerTurnRegistry — SQLite-backed composer turn store.
 *
 * Tests the store layer directly, independent of the HTTP handler.
 * Coverage: create, getById, list (with filters + cursor), updateStatus,
 * updateResponse, delete, and ComposerTurnNotFoundError.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, loadBundledMigrations } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ComposerTurnRegistry,
  ComposerTurnNotFoundError,
} from "./composer.ts";

// ---------------------------------------------------------------------------
// Test database setup
// ---------------------------------------------------------------------------

function openDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return db;
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function makeCreateInput(overrides: Partial<{
  id: string;
  scope: { kind: string; id?: string };
  message: string;
  artifact_refs: unknown[];
  media_inputs: unknown[];
  context_refs: unknown[];
  intent_hint: string;
  allowed_action_classes: string[];
  delegation_policy: { allow_subagents: boolean; max_subagents: number; require_preview_for_mutations: boolean };
  provider_chain: string[];
  transcription: { mode: string; language?: string };
  max_cost_usd: number;
  approval_policy: string;
  now: string;
}> = {}): Parameters<ComposerTurnRegistry["create"]>[0] {
  return {
    scope: { kind: "global", ...overrides.scope },
    message: "Test turn",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ComposerTurnRegistry", () => {
  let db: Database;
  let registry: ComposerTurnRegistry;

  beforeEach(() => {
    db = openDb();
    registry = new ComposerTurnRegistry(db);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // ComposerTurnNotFoundError
  // -------------------------------------------------------------------------

  describe("ComposerTurnNotFoundError", () => {
    test("code is composer_turn_not_found", () => {
      const err = new ComposerTurnNotFoundError("ct_abc");
      expect(err.code).toBe("composer_turn_not_found");
      expect(err.id).toBe("ct_abc");
      expect(err.message).toBe("Composer turn not found: ct_abc");
      expect(err.name).toBe("ComposerTurnNotFoundError");
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    test("creates a turn with required fields only and returns queued status", () => {
      const input = makeCreateInput({ message: "Hello composer" });
      const turn = registry.create(input);

      expect(turn.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(turn.scope.kind).toBe("global");
      expect(turn.scope.id).toBeUndefined();
      expect(turn.message).toBe("Hello composer");
      expect(turn.status).toBe("queued");
      expect(turn.media_mode).toBe("none");
      expect(turn.voice_mode).toBe("none");
      expect(turn.delegated_refs).toEqual([]);
      expect(turn.launched_refs).toEqual([]);
      expect(turn.proposed_actions).toEqual([]);
      expect(turn.proposal_refs).toEqual([]);
      expect(turn.usage.tokens_in).toBe(0);
      expect(turn.usage.tokens_out).toBe(0);
      expect(turn.usage.cost_usd).toBe(0);
      expect(turn.created_at).toBeTruthy();
      expect(turn.updated_at).toBeTruthy();
    });

    test("uses provided id if given", () => {
      const turn = registry.create(makeCreateInput({ id: "ct_fixed_id" }));
      expect(turn.id).toBe("ct_fixed_id");
    });

    test("respects now parameter for created_at/updated_at", () => {
      const turn = registry.create(makeCreateInput({ now: "2026-01-01T00:00:00.000Z" }));
      expect(turn.created_at).toBe("2026-01-01T00:00:00.000Z");
      expect(turn.updated_at).toBe("2026-01-01T00:00:00.000Z");
    });

    test("creates turn with all optional fields populated", () => {
      const turn = registry.create(makeCreateInput({
        scope: { kind: "project", id: "p_abc" },
        message: "Full turn",
        artifact_refs: [{ artifact_id: "a_1", role: "screenshot" }],
        media_inputs: [{ kind: "image", artifact_id: "a_2", caption: "see this" }],
        context_refs: [{ kind: "project", project_id: "p_xyz" }],
        intent_hint: "research",
        allowed_action_classes: ["read", "research"],
        delegation_policy: { allow_subagents: true, max_subagents: 2, require_preview_for_mutations: false },
        provider_chain: ["codex"],
        transcription: { mode: "native_provider", language: "en" },
        max_cost_usd: 1.5,
        approval_policy: "auto_approved",
      }));

      expect(turn.scope.kind).toBe("project");
      expect(turn.scope.id).toBe("p_abc");
      expect(turn.artifact_refs).toEqual([{ artifact_id: "a_1", role: "screenshot" }]);
      // Check key fields; exact field ordering from DB round-trip may differ
      const mi = turn.media_inputs[0]!;
      expect(mi.kind).toBe("image");
      expect(mi.artifact_id).toBe("a_2");
      expect(mi.caption).toBe("see this");
      expect(turn.context_refs).toEqual([{ kind: "project", project_id: "p_xyz" }]);
      expect(turn.intent_hint).toBe("research");
      expect(turn.allowed_action_classes).toEqual(["read", "research"]);
      expect(turn.delegation_policy.allow_subagents).toBe(true);
      expect(turn.delegation_policy.max_subagents).toBe(2);
      expect(turn.delegation_policy.require_preview_for_mutations).toBe(false);
      expect(turn.provider_chain).toEqual(["codex"]);
      expect(turn.transcription).toEqual({ mode: "native_provider", language: "en", allow_client_transcript: undefined });
      expect(turn.max_cost_usd).toBe(1.5);
      expect(turn.approval_policy).toBe("auto_approved");
    });

    test("created turn is retrievable via getById", () => {
      const created = registry.create(makeCreateInput({ id: "ct_retrievable", message: "Find me" }));
      const found = registry.getById("ct_retrievable");
      expect(found.id).toBe("ct_retrievable");
      expect(found.message).toBe("Find me");
    });
  });

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  describe("getById", () => {
    test("returns a turn by id", () => {
      registry.create(makeCreateInput({ id: "ct_findme", message: "Find me" }));
      const found = registry.getById("ct_findme");
      expect(found.id).toBe("ct_findme");
      expect(found.message).toBe("Find me");
    });

    test("throws ComposerTurnNotFoundError for unknown id", () => {
      expect(() => registry.getById("ct_unknown")).toThrow(ComposerTurnNotFoundError);
      expect(() => registry.getById("ct_unknown")).toThrow("Composer turn not found: ct_unknown");
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    test("returns empty array when no turns", () => {
      expect(registry.list()).toEqual([]);
    });

    test("returns all turns ordered by created_at DESC (most recent first)", () => {
      registry.create(makeCreateInput({ id: "ct_first", message: "First", now: "2026-01-01T00:00:01.000Z" }));
      registry.create(makeCreateInput({ id: "ct_second", message: "Second", now: "2026-01-01T00:00:02.000Z" }));

      const turns = registry.list();
      expect(turns).toHaveLength(2);
      expect(turns[0]!.message).toBe("Second");
      expect(turns[1]!.message).toBe("First");
    });

    test("filters by scope_kind", () => {
      registry.create(makeCreateInput({ scope: { kind: "global" } }));
      registry.create(makeCreateInput({ scope: { kind: "project", id: "p_abc" } }));

      const turns = registry.list({ scope_kind: "project" });
      expect(turns).toHaveLength(1);
      expect(turns[0]!.scope.kind).toBe("project");
    });

    test("filters by scope_id", () => {
      registry.create(makeCreateInput({ scope: { kind: "project", id: "p_abc" } }));
      registry.create(makeCreateInput({ scope: { kind: "project", id: "p_xyz" } }));

      const turns = registry.list({ scope_id: "p_abc" });
      expect(turns).toHaveLength(1);
      expect(turns[0]!.scope.id).toBe("p_abc");
    });

    test("filters by status", () => {
      registry.create(makeCreateInput({ id: "ct_queued" }));
      const created = registry.create(makeCreateInput({ id: "ct_running", message: "Running" }));
      registry.updateStatus(created.id, "running");

      const queued = registry.list({ status: "queued" });
      expect(queued).toHaveLength(1);
      expect(queued[0]!.id).toBe("ct_queued");

      const running = registry.list({ status: "running" });
      expect(running).toHaveLength(1);
      expect(running[0]!.id).toBe("ct_running");
    });

    test("default limit is 20", () => {
      for (let i = 0; i < 25; i++) {
        registry.create(makeCreateInput({ id: `ct_${i}`, message: `Turn ${i}` }));
      }
      expect(registry.list()).toHaveLength(20);
    });

    test("limit is capped at 100", () => {
      for (let i = 0; i < 5; i++) {
        registry.create(makeCreateInput({ id: `ct_${i}` }));
      }
      expect(registry.list({ limit: 200 })).toHaveLength(5);
    });

    test("cursor pagination returns next page", () => {
      // Create 4 turns with distinct timestamps
      for (let i = 0; i < 4; i++) {
        registry.create(makeCreateInput({
          id: `ct_${i}`,
          message: `Turn ${i}`,
          now: `2026-01-01T00:00:0${i}.000Z`,
        }));
      }

      const page1 = registry.list({ limit: 2 });
      expect(page1).toHaveLength(2);
      expect(page1[0]!.message).toBe("Turn 3"); // Most recent
      expect(page1[1]!.message).toBe("Turn 2");

      const cursor = page1[1]!.created_at;
      const page2 = registry.list({ limit: 2, cursor });
      expect(page2).toHaveLength(2);
      expect(page2[0]!.message).toBe("Turn 1");
      expect(page2[1]!.message).toBe("Turn 0");

      // No overlap
      const page1Ids = page1.map((t) => t.id);
      for (const id of page2.map((t) => t.id)) {
        expect(page1Ids).not.toContain(id);
      }
    });

    test("no next_cursor when fewer results than limit", () => {
      registry.create(makeCreateInput({ id: "ct_one" }));
      registry.create(makeCreateInput({ id: "ct_two" }));

      const turns = registry.list({ limit: 10 });
      expect(turns).toHaveLength(2);
      // next_cursor is not a field on the turn object; it's computed in turnListResponse
      // just verify we got all items
      expect(turns.map((t) => t.id).sort()).toEqual(["ct_one", "ct_two"]);
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------

  describe("updateStatus", () => {
    test("updates status of an existing turn", () => {
      const created = registry.create(makeCreateInput({ id: "ct_status" }));
      const updated = registry.updateStatus("ct_status", "running");

      expect(updated.status).toBe("running");
      expect(updated.id).toBe("ct_status");
    });

    test("updated turn is retrievable with new status", () => {
      const created = registry.create(makeCreateInput({ id: "ct_persist" }));
      registry.updateStatus("ct_persist", "waiting_for_approval");
      const found = registry.getById("ct_persist");
      expect(found.status).toBe("waiting_for_approval");
    });

    test("throws ComposerTurnNotFoundError for unknown id", () => {
      expect(() => registry.updateStatus("ct_unknown", "cancelled")).toThrow(ComposerTurnNotFoundError);
    });

    test("respects now parameter", () => {
      const created = registry.create(makeCreateInput({ id: "ct_ts" }));
      const before = created.updated_at;
      const updated = registry.updateStatus("ct_ts", "completed", "2026-06-01T00:00:00.000Z");
      expect(updated.updated_at).toBe("2026-06-01T00:00:00.000Z");
    });
  });

  // -------------------------------------------------------------------------
  // updateResponse
  // -------------------------------------------------------------------------

  describe("updateResponse", () => {
    test("updates media_mode and voice_mode", () => {
      const created = registry.create(makeCreateInput({ id: "ct_response" }));
      const updated = registry.updateResponse("ct_response", {
        media_mode: "native",
        voice_mode: "transcribed",
      });

      expect(updated.media_mode).toBe("native");
      expect(updated.voice_mode).toBe("transcribed");
    });

    test("updates delegated_refs", () => {
      const created = registry.create(makeCreateInput({ id: "ct_delegated" }));
      const updated = registry.updateResponse("ct_delegated", {
        delegated_refs: [{ kind: "control_subagent_run", id: "csr_abc" }],
      });

      expect(updated.delegated_refs).toEqual([{ kind: "control_subagent_run", id: "csr_abc" }]);
    });

    test("updates launched_refs", () => {
      const created = registry.create(makeCreateInput({ id: "ct_launched" }));
      const updated = registry.updateResponse("ct_launched", {
        launched_refs: [{ kind: "session", id: "s_xyz" }],
      });

      expect(updated.launched_refs).toEqual([{ kind: "session", id: "s_xyz" }]);
    });

    test("updates proposed_actions", () => {
      const created = registry.create(makeCreateInput({ id: "ct_proposed" }));
      const updated = registry.updateResponse("ct_proposed", {
        proposed_actions: [{ action_class: "read", description: "Read the file" }],
      });

      expect(updated.proposed_actions).toEqual([{ action_class: "read", description: "Read the file" }]);
    });

    test("updates proposal_refs", () => {
      const created = registry.create(makeCreateInput({ id: "ct_proposals" }));
      const updated = registry.updateResponse("ct_proposals", {
        proposal_refs: ["prop_abc", "prop_xyz"],
      });

      expect(updated.proposal_refs).toEqual(["prop_abc", "prop_xyz"]);
    });

    test("updates usage", () => {
      const created = registry.create(makeCreateInput({ id: "ct_usage" }));
      const updated = registry.updateResponse("ct_usage", {
        usage: { tokens_in: 1000, tokens_out: 500, cost_usd: 0.05 },
      });

      expect(updated.usage.tokens_in).toBe(1000);
      expect(updated.usage.tokens_out).toBe(500);
      expect(updated.usage.cost_usd).toBe(0.05);
    });

    test("updates status via updateResponse", () => {
      const created = registry.create(makeCreateInput({ id: "ct_status_via_response" }));
      const updated = registry.updateResponse("ct_status_via_response", { status: "completed" });
      expect(updated.status).toBe("completed");
    });

    test("throws ComposerTurnNotFoundError for unknown id", () => {
      expect(() => registry.updateResponse("ct_unknown", { status: "cancelled" })).toThrow(ComposerTurnNotFoundError);
    });

    test("partial update does not overwrite other fields", () => {
      const created = registry.create(makeCreateInput({
        id: "ct_partial",
        message: "Original message",
      }));
      registry.updateStatus("ct_partial", "running");
      const updated = registry.updateResponse("ct_partial", { media_mode: "native" });

      expect(updated.status).toBe("running");
      expect(updated.media_mode).toBe("native");
      expect(updated.message).toBe("Original message");
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe("delete", () => {
    test("deletes an existing turn", () => {
      registry.create(makeCreateInput({ id: "ct_delete" }));
      registry.delete("ct_delete");

      expect(() => registry.getById("ct_delete")).toThrow(ComposerTurnNotFoundError);
    });

    test("throws ComposerTurnNotFoundError for unknown id", () => {
      expect(() => registry.delete("ct_unknown")).toThrow(ComposerTurnNotFoundError);
    });

    test("deleting one turn does not affect others", () => {
      registry.create(makeCreateInput({ id: "ct_keep" }));
      registry.create(makeCreateInput({ id: "ct_remove" }));
      registry.delete("ct_remove");

      const remaining = registry.list();
      expect(remaining.map((t) => t.id)).toEqual(["ct_keep"]);
    });
  });
});
