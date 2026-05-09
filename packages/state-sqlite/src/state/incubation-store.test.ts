import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "./database.ts";
import {
  IncubationStore,
  IncubationItemNotFoundError,
  ResearchRunNotFoundError,
  ProposalNotFoundError,
  CommentNotFoundError,
  type IncubationScope,
  type IncubationItemStatus,
  type ResearchRunMode,
  type ProposalKind,
  type ProposalState,
  type ResearchSourcePlan,
} from "./incubation-store.ts";

describe("IncubationStore", () => {
  let store: IncubationStore;

  beforeEach(() => {
    const { db } = openDatabase(":memory:");
    store = new IncubationStore(db);
  });

  // ── IncubationItem CRUD ───────────────────────────────────────────────────

  describe("createItem", () => {
    test("creates a global item with required fields", () => {
      const item = store.createItem({
        scope: "global",
        title: "My Idea",
        description: "Something worth investigating",
      });
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.scope).toBe("global");
      expect(item.project_id).toBeUndefined();
      expect(item.title).toBe("My Idea");
      expect(item.description).toBe("Something worth investigating");
      expect(item.status).toBe("active");
      expect(item.research_runs).toEqual([]);
      expect(item.proposal).toBeUndefined();
      expect(item.created_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(item.updated_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    test("creates a project-scoped item", () => {
      const item = store.createItem({
        scope: "project",
        project_id: "proj_123",
        title: "Project Research",
        description: "Look into this",
      });
      expect(item.scope).toBe("project");
      expect(item.project_id).toBe("proj_123");
    });

    test("creates with custom id and now", () => {
      const item = store.createItem({
        id: "custom-id",
        scope: "global",
        title: "T",
        description: "D",
        now: "2025-01-01T00:00:00Z",
      });
      expect(item.id).toBe("custom-id");
      expect(item.created_at).toBe("2025-01-01T00:00:00Z");
    });

    test("respects initial status", () => {
      const item = store.createItem({
        scope: "global",
        title: "T",
        description: "D",
        status: "paused",
      });
      expect(item.status).toBe("paused");
    });
  });

  describe("getItem", () => {
    test("returns undefined for unknown id", () => {
      expect(store.getItem("nope")).toBeUndefined();
    });

    test("finds a created item", () => {
      const created = store.createItem({ scope: "global", title: "T", description: "D" });
      const found = store.getItem(created.id);
      expect(found?.id).toBe(created.id);
    });
  });

  describe("listItems", () => {
    test("returns empty array when no items", () => {
      expect(store.listItems()).toEqual([]);
    });

    test("returns all items ordered by created_at desc", () => {
      const a = store.createItem({ scope: "global", title: "A", description: "D", now: "2025-01-01T00:00:00Z" });
      const b = store.createItem({ scope: "global", title: "B", description: "D", now: "2025-01-02T00:00:00Z" });
      const list = store.listItems();
      expect(list.map((i) => i.id)).toEqual([b.id, a.id]);
    });

    test("filters by scope", () => {
      store.createItem({ scope: "global", title: "G", description: "D" });
      store.createItem({ scope: "project", project_id: "p1", title: "P", description: "D" });
      expect(store.listItems({ scope: "global" }).length).toBe(1);
      expect(store.listItems({ scope: "project" }).length).toBe(1);
      expect(store.listItems({ scope: "candidate_project" }).length).toBe(0);
    });

    test("filters by project_id", () => {
      store.createItem({ scope: "global", title: "G", description: "D" });
      store.createItem({ scope: "project", project_id: "p1", title: "P1", description: "D" });
      store.createItem({ scope: "project", project_id: "p2", title: "P2", description: "D" });
      expect(store.listItems({ project_id: "p1" }).map((i) => i.title)).toEqual(["P1"]);
      expect(store.listItems({ project_id: "p2" }).map((i) => i.title)).toEqual(["P2"]);
    });

    test("filters by status", () => {
      store.createItem({ scope: "global", title: "A", description: "D", status: "active" });
      store.createItem({ scope: "global", title: "B", description: "D", status: "paused" });
      expect(store.listItems({ status: "active" }).map((i) => i.title)).toEqual(["A"]);
      expect(store.listItems({ status: "paused" }).map((i) => i.title)).toEqual(["B"]);
    });

    test("combines scope + project_id + status filters", () => {
      store.createItem({ scope: "global", title: "G1", description: "D" });
      store.createItem({ scope: "project", project_id: "p1", title: "P1A", description: "D", status: "active" });
      store.createItem({ scope: "project", project_id: "p1", title: "P1B", description: "D", status: "paused" });
      store.createItem({ scope: "project", project_id: "p2", title: "P2A", description: "D", status: "active" });
      const result = store.listItems({ scope: "project", project_id: "p1", status: "paused" });
      expect(result.map((i) => i.title)).toEqual(["P1B"]);
    });
  });

  describe("updateItem", () => {
    test("updates title", () => {
      const item = store.createItem({ scope: "global", title: "Old", description: "D" });
      const updated = store.updateItem(item.id, { title: "New" });
      expect(updated.title).toBe("New");
    });

    test("updates description", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "Old" });
      const updated = store.updateItem(item.id, { description: "New" });
      expect(updated.description).toBe("New");
    });

    test("updates status", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const updated = store.updateItem(item.id, { status: "paused" });
      expect(updated.status).toBe("paused");
    });

    test("updates project_id", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const updated = store.updateItem(item.id, { project_id: "proj_x" });
      expect(updated.project_id).toBe("proj_x");
    });

    test("can clear project_id by passing null", () => {
      const item = store.createItem({ scope: "project", project_id: "p1", title: "T", description: "D" });
      const updated = store.updateItem(item.id, { project_id: null });
      expect(updated.project_id).toBeUndefined();
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      expect(() => store.updateItem("nope", { title: "New" })).toThrow(IncubationItemNotFoundError);
    });
  });

  describe("deleteItem", () => {
    test("deletes an existing item", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      store.deleteItem(item.id);
      expect(store.getItem(item.id)).toBeUndefined();
    });

    test("throws IncubationItemNotFoundError for unknown id", () => {
      expect(() => store.deleteItem("nope")).toThrow(IncubationItemNotFoundError);
    });
  });

  // ── ResearchRun CRUD ─────────────────────────────────────────────────────

  describe("createRun", () => {
    test("creates a run for an incubation item", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({
        incubation_item_id: item.id,
        mode: "source_synthesis",
        plan: [{ kind: "web_page", description: "Check docs", location: "https://example.com" }],
      });
      expect(run.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(run.incubation_item_id).toBe(item.id);
      expect(run.mode).toBe("source_synthesis");
      expect(run.status).toBe("pending");
      expect(run.plan).toHaveLength(1);
      expect(run.plan[0]!.kind).toBe("web_page");
    });

    test("creates with custom id and now", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({
        id: "run-custom",
        incubation_item_id: item.id,
        mode: "monitor_tick",
        plan: [],
        status: "running",
        now: "2025-01-01T00:00:00Z",
      });
      expect(run.id).toBe("run-custom");
      expect(run.status).toBe("running");
      expect(run.created_at).toBe("2025-01-01T00:00:00Z");
    });
  });

  describe("getRun", () => {
    test("returns undefined for unknown id", () => {
      expect(store.getRun("nope")).toBeUndefined();
    });

    test("finds a created run", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({ incubation_item_id: item.id, mode: "source_synthesis", plan: [] });
      expect(store.getRun(run.id)?.id).toBe(run.id);
    });
  });

  describe("listRuns", () => {
    test("returns runs for an incubation item ordered by created_at desc", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const r1 = store.createRun({ incubation_item_id: item.id, mode: "source_synthesis", plan: [], now: "2025-01-01T00:00:00Z" });
      const r2 = store.createRun({ incubation_item_id: item.id, mode: "monitor_tick", plan: [], now: "2025-01-02T00:00:00Z" });
      const runs = store.listRuns(item.id);
      expect(runs.map((r) => r.id)).toEqual([r2.id, r1.id]);
    });

    test("returns empty array for item with no runs", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      expect(store.listRuns(item.id)).toEqual([]);
    });
  });

  describe("updateRun", () => {
    test("updates status", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({ incubation_item_id: item.id, mode: "source_synthesis", plan: [] });
      const updated = store.updateRun(run.id, { status: "running" });
      expect(updated.status).toBe("running");
    });

    test("updates results", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({ incubation_item_id: item.id, mode: "source_synthesis", plan: [] });
      const results = { findings: ["a", "b"] };
      const updated = store.updateRun(run.id, { results });
      expect(updated.results).toEqual(results);
    });

    test("sets started_at and completed_at", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({ incubation_item_id: item.id, mode: "source_synthesis", plan: [] });
      const updated = store.updateRun(run.id, {
        status: "completed",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-01T01:00:00Z",
      });
      expect(updated.started_at).toBe("2025-01-01T00:00:00Z");
      expect(updated.completed_at).toBe("2025-01-01T01:00:00Z");
    });

    test("throws ResearchRunNotFoundError for unknown id", () => {
      expect(() => store.updateRun("nope", { status: "running" })).toThrow(ResearchRunNotFoundError);
    });
  });

  // ── Proposal CRUD ────────────────────────────────────────────────────────

  describe("createProposal", () => {
    test("creates a proposal linked to an incubation item", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "Add feature X",
        description: "We should build X because...",
      });
      expect(proposal.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(proposal.incubation_item_id).toBe(item.id);
      expect(proposal.kind).toBe("story");
      expect(proposal.title).toBe("Add feature X");
    });

    test("creates with promotion_ref", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "epic",
        title: "T",
        description: "D",
        promotion_target: "sprint",
        promotion_ref: { target: "sprint", ref: "epic_42" },
      });
      expect(proposal.promotion_ref).toEqual({ target: "sprint", ref: "epic_42" });
    });

    test("auto-links to incubation item when item has no proposal yet", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "discard",
        title: "T",
        description: "D",
      });
      const updated = store.getItem(item.id);
      expect(updated?.proposal?.id).toBe(proposal.id);
    });

    test("does not relink if item already has a proposal", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const p1 = store.createProposal({ incubation_item_id: item.id, kind: "story", title: "First", description: "D" });
      const p2 = store.createProposal({ incubation_item_id: item.id, kind: "story", title: "Second", description: "D" });
      const updated = store.getItem(item.id);
      expect(updated?.proposal?.id).toBe(p1.id);
    });
  });

  describe("getProposal", () => {
    test("returns undefined for unknown id", () => {
      expect(store.getProposal("nope")).toBeUndefined();
    });

    test("finds a created proposal", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({ incubation_item_id: item.id, kind: "story", title: "T", description: "D" });
      expect(store.getProposal(proposal.id)?.id).toBe(proposal.id);
    });
  });

  describe("listProposals", () => {
    test("returns proposals for an incubation item", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const p1 = store.createProposal({ incubation_item_id: item.id, kind: "story", title: "P1", description: "D", now: "2025-01-01T00:00:00Z" });
      const p2 = store.createProposal({ incubation_item_id: item.id, kind: "epic", title: "P2", description: "D", now: "2025-01-02T00:00:00Z" });
      const proposals = store.listProposals(item.id);
      expect(proposals.map((p) => p.id)).toEqual([p2.id, p1.id]);
    });

    test("returns empty array for item with no proposals", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      expect(store.listProposals(item.id)).toEqual([]);
    });
  });

  // ── Proposal state ─────────────────────────────────────────────────────────

  describe("proposal state machine", () => {
    test("newly created proposal has state 'draft'", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      expect(proposal.state).toBe("draft");
    });

    test("updateProposal can transition state to 'ready'", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      const updated = store.updateProposal(proposal.id, { state: "ready" });
      expect(updated.state).toBe("ready");
    });

    test("applyProposal marks proposal as applied", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      const applied = store.applyProposal(proposal.id);
      expect(applied.state).toBe("applied");
    });

    test("applyProposal marks item status as promoted", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      store.applyProposal(proposal.id);
      const refreshed = store.getItem(item.id)!;
      expect(refreshed.status).toBe("promoted");
    });

    test("applyProposal records promotion ref on the item", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
        promotion_target: "backlog",
      });
      store.applyProposal(proposal.id);
      const refreshed = store.getItem(item.id)!;
      expect(refreshed.promoted_refs).toContainEqual({
        target: "backlog",
        ref: proposal.id,
      });
    });

    test("applyProposal is idempotent (re-apply returns same result)", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      const first = store.applyProposal(proposal.id);
      // Idempotent: re-apply does not throw, returns same proposal
      const second = store.applyProposal(proposal.id);
      expect(first.id).toBe(second.id);
      expect(first.state).toBe("applied");
      expect(second.state).toBe("applied");
    });

    test("applyProposal throws on rejected proposal", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      store.updateProposal(proposal.id, { state: "rejected" });
      expect(() => store.applyProposal(proposal.id)).toThrow("cannot apply a rejected proposal");
    });

    test("getProposal returns state in response", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const proposal = store.createProposal({
        incubation_item_id: item.id,
        kind: "story",
        title: "P",
        description: "Desc",
      });
      expect(store.getProposal(proposal.id)!.state).toBe("draft");
      store.updateProposal(proposal.id, { state: "ready" });
      expect(store.getProposal(proposal.id)!.state).toBe("ready");
    });
  });

  // ── Cascading delete ─────────────────────────────────────────────────────

  describe("deleteItem cascades research_runs and proposals", () => {
    test("deleting an item removes its runs", () => {
      const item = store.createItem({ scope: "global", title: "T", description: "D" });
      const run = store.createRun({ incubation_item_id: item.id, mode: "source_synthesis", plan: [] });
      store.deleteItem(item.id);
      expect(store.getRun(run.id)).toBeUndefined();
    });
  });
});