import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SetupStore } from "./setup-store.ts";
import {
  SetupRunNotFoundError,
  SetupRunNotActiveError,
} from "./setup-types.ts";
import type {
  CreateSetupRunInput,
  SetupQuestion,
  SetupChapter,
  SetupCommentInput,
  RepoInventoryFinding,
  StackDetectionFinding,
  EnvironmentDetectionFinding,
} from "./setup-types.ts";

function makeStore(tmp: string) {
  return new SetupStore({ stateDir: join(tmp, "state") });
}

describe("SetupStore", () => {
  let tmp: string;
  let store: SetupStore;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-setup-store-"));
    store = makeStore(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("create", () => {
    test("creates a run with defaults", () => {
      const input: CreateSetupRunInput = { absPath: "/test/project" };
      const run = store.create(input);
      expect(run.id).toMatch(/^setup_[a-f0-9-]+$/);
      expect(run.absPath).toBe("/test/project");
      expect(run.mode).toBe("standalone");
      expect(run.status).toBe("active");
      expect(run.phase).toBe("discovery");
      expect(run.verdict).toBe("unresolved");
      expect(run.projectId).toBeNull();
      expect(run.completedAt).toBeNull();
      expect(run.questions).toEqual([]);
      expect(run.chapters).toEqual([]);
      expect(run.nonInteractive).toBe(false);
      expect(run.flags).toEqual({});
    });

    test("creates a run with explicit mode", () => {
      const input: CreateSetupRunInput = { absPath: "/test/project", mode: "orchestrator" };
      const run = store.create(input);
      expect(run.mode).toBe("orchestrator");
    });

    test("creates a run with nonInteractive and flags", () => {
      const input: CreateSetupRunInput = {
        absPath: "/test/project",
        nonInteractive: true,
        flags: { feature: "value" },
      };
      const run = store.create(input);
      expect(run.nonInteractive).toBe(true);
      expect(run.flags).toEqual({ feature: "value" });
    });

    test("persists the run to disk", () => {
      const run = store.create({ absPath: "/test/project" });
      const retrieved = store.get(run.id);
      expect(retrieved.id).toBe(run.id);
      expect(retrieved.absPath).toBe("/test/project");
    });
  });

  describe("list", () => {
    test("returns empty array when no runs exist", () => {
      expect(store.list()).toEqual([]);
    });

    test("returns runs sorted by updatedAt descending", async () => {
      const run1 = store.create({ absPath: "/project1" });
      // Yield to event loop so run2 gets a strictly later timestamp
      await new Promise((r) => setTimeout(r, 10));
      const run2 = store.create({ absPath: "/project2" });
      // Update run1 to make it definitively newer than run2
      store.updatePhase(run1.id, "interview");
      const runs = store.list();
      expect(runs[0].id).toBe(run1.id);
      expect(runs[1].id).toBe(run2.id);
    });

    test("skips corrupted entries", () => {
      const run = store.create({ absPath: "/project" });
      // Write a corrupted JSON file alongside valid runs
      const stateDir = join(tmp, "state");
      const runsDir = join(stateDir, "setup_runs");
      writeFileSync(join(runsDir, "corrupted.json"), "{ not valid json", "utf-8");
      writeFileSync(join(runsDir, "not_a_run"), "also not valid", "utf-8");
      const list = store.list();
      expect(list.map((r) => r.id)).toEqual([run.id]);
    });
  });

  describe("get", () => {
    test("returns an existing run", () => {
      const created = store.create({ absPath: "/test/project" });
      const retrieved = store.get(created.id);
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.absPath).toBe("/test/project");
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      expect(() => store.get("nonexistent")).toThrow(SetupRunNotFoundError);
    });
  });

  describe("updatePhase", () => {
    test("updates the phase and updatedAt", () => {
      const run = store.create({ absPath: "/test" });
      expect(run.phase).toBe("discovery");
      const updated = store.updatePhase(run.id, "interview");
      expect(updated.phase).toBe("interview");
      expect(updated.updatedAt).toBeDefined();
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      expect(() => store.updatePhase("nonexistent", "interview")).toThrow(SetupRunNotFoundError);
    });
  });

  describe("updateVerdict", () => {
    test("updates the verdict", () => {
      const run = store.create({ absPath: "/test" });
      const updated = store.updateVerdict(run.id, "resolved");
      expect(updated.verdict).toBe("resolved");
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      expect(() => store.updateVerdict("nonexistent", "resolved")).toThrow(SetupRunNotFoundError);
    });
  });

  describe("addQuestion", () => {
    test("appends a question to the questions array", () => {
      const run = store.create({ absPath: "/test" });
      const question: SetupQuestion = {
        id: "q1",
        topic: "testing",
        text: "Is this tested?",
        prerequisites: [],
        branch: "main",
        invalidationConditions: [],
        followUpEdges: [],
      };
      const updated = store.addQuestion(run.id, question);
      expect(updated.questions).toHaveLength(1);
      expect(updated.questions[0].id).toBe("q1");
      expect(updated.questions[0].text).toBe("Is this tested?");
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      const question: SetupQuestion = {
        id: "q1",
        topic: "testing",
        text: "Is this tested?",
        prerequisites: [],
        branch: "main",
        invalidationConditions: [],
        followUpEdges: [],
      };
      expect(() => store.addQuestion("nonexistent", question)).toThrow(SetupRunNotFoundError);
    });
  });

  describe("answerQuestion", () => {
    test("sets answer and answeredAt on an existing question", () => {
      const run = store.create({ absPath: "/test" });
      const question: SetupQuestion = {
        id: "q1",
        topic: "testing",
        text: "Is this tested?",
        prerequisites: [],
        branch: "main",
        invalidationConditions: [],
        followUpEdges: [],
      };
      store.addQuestion(run.id, question);
      const updated = store.answerQuestion(run.id, "q1", "yes it is");
      expect(updated.questions[0].answer).toBe("yes it is");
      expect(updated.questions[0].answeredAt).not.toBeNull();
    });

    test("leaves other questions unchanged", () => {
      const run = store.create({ absPath: "/test" });
      const q1: SetupQuestion = {
        id: "q1", topic: "t1", text: "Q1", prerequisites: [], branch: "main",
        invalidationConditions: [], followUpEdges: [],
      };
      const q2: SetupQuestion = {
        id: "q2", topic: "t2", text: "Q2", prerequisites: [], branch: "main",
        invalidationConditions: [], followUpEdges: [],
      };
      store.addQuestion(run.id, q1);
      store.addQuestion(run.id, q2);
      store.answerQuestion(run.id, "q1", "answer1");
      const updated = store.get(run.id);
      expect(updated.questions.find((q) => q.id === "q1")?.answer).toBe("answer1");
      expect(updated.questions.find((q) => q.id === "q2")?.answer).toBeUndefined();
    });

    test("throws SetupRunNotFoundError for unknown run id", () => {
      expect(() => store.answerQuestion("nonexistent", "q1", "ans")).toThrow(SetupRunNotFoundError);
    });
  });

  describe("addChapter", () => {
    test("appends a chapter to the chapters array", () => {
      const run = store.create({ absPath: "/test" });
      const chapter: SetupChapter = {
        id: "ch1",
        title: "Overview",
        body: "Chapter content",
        status: "draft",
        artifactRefs: [],
      };
      const updated = store.addChapter(run.id, chapter);
      expect(updated.chapters).toHaveLength(1);
      expect(updated.chapters[0].title).toBe("Overview");
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      const chapter: SetupChapter = {
        id: "ch1", title: "Overview", body: "Content", status: "draft", artifactRefs: [],
      };
      expect(() => store.addChapter("nonexistent", chapter)).toThrow(SetupRunNotFoundError);
    });
  });

  describe("addComment", () => {
    test("appends a synthetic chapter entry for the comment", () => {
      const run = store.create({ absPath: "/test" });
      const comment: SetupCommentInput = {
        target_type: "chapter",
        target_id: "ch1",
        body: "This needs more detail",
        artifact_refs: ["file:///artifacts/notes.txt"],
      };
      const updated = store.addComment(run.id, comment);
      expect(updated.chapters).toHaveLength(1);
      expect(updated.chapters[0].title).toContain("Comment on chapter: ch1");
      expect(updated.chapters[0].body).toBe("This needs more detail");
      expect(updated.chapters[0].artifactRefs).toEqual(["file:///artifacts/notes.txt"]);
      expect(updated.chapters[0].status).toBe("draft");
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      const comment: SetupCommentInput = {
        target_type: "chapter", target_id: "ch1", body: "comment",
      };
      expect(() => store.addComment("nonexistent", comment)).toThrow(SetupRunNotFoundError);
    });
  });

  describe("setProjectId", () => {
    test("sets the projectId", () => {
      const run = store.create({ absPath: "/test" });
      const updated = store.setProjectId(run.id, "proj_123abc");
      expect(updated.projectId).toBe("proj_123abc");
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      expect(() => store.setProjectId("nonexistent", "proj_123")).toThrow(SetupRunNotFoundError);
    });
  });

  describe("updateFindings", () => {
    test("sets a single finding field", () => {
      const run = store.create({ absPath: "/test" });
      const inventory: RepoInventoryFinding = {
        fileCount: 42,
        moduleBoundaries: ["packages/core", "packages/cli"],
        notableHotspots: ["packages/cli/src/index.ts"],
        classifications: { typescript: ["src/**/*.ts"], markdown: ["*.md"] },
      };
      const updated = store.updateFindings(run.id, { repoInventory: inventory });
      expect(updated.findings.repoInventory).toEqual(inventory);
    });

    test("merges multiple finding fields independently", () => {
      const run = store.create({ absPath: "/test" });
      const env: EnvironmentDetectionFinding = {
        availableProviders: ["opencode", "claude"],
        usableProviders: ["claude"],
        trackerAdapter: "builtin",
        devcontainerJsonPresent: false,
        ghAuthAvailable: false,
        providerAuthDetails: { opencode: "needs_config", claude: "usable" },
      };
      const stack: StackDetectionFinding = {
        language: "typescript",
        framework: null,
        testRunner: "bun",
        cssApproach: null,
        bundler: "vite",
        runtimeVersions: { node: "20.x" },
        configFiles: ["package.json", "tsconfig.json"],
      };
      store.updateFindings(run.id, { environment: env });
      const updated = store.updateFindings(run.id, { stackDetection: stack });
      expect(updated.findings.environment).toEqual(env);
      expect(updated.findings.stackDetection).toEqual(stack);
    });

    test("overwrites an existing finding field", () => {
      const run = store.create({ absPath: "/test" });
      const stack1: StackDetectionFinding = {
        language: "typescript",
        framework: null,
        testRunner: "bun",
        cssApproach: null,
        bundler: null,
        runtimeVersions: {},
        configFiles: [],
      };
      const stack2: StackDetectionFinding = {
        language: "rust",
        framework: null,
        testRunner: "cargo",
        cssApproach: null,
        bundler: null,
        runtimeVersions: {},
        configFiles: ["Cargo.toml"],
      };
      store.updateFindings(run.id, { stackDetection: stack1 });
      const updated = store.updateFindings(run.id, { stackDetection: stack2 });
      expect(updated.findings.stackDetection).toEqual(stack2);
    });

    test("updates updatedAt timestamp", async () => {
      const run = store.create({ absPath: "/test" });
      const before = run.updatedAt;
      await new Promise((r) => setTimeout(r, 10));
      const env: EnvironmentDetectionFinding = {
        availableProviders: [],
        usableProviders: [],
        trackerAdapter: null,
        devcontainerJsonPresent: false,
        ghAuthAvailable: false,
        providerAuthDetails: {},
      };
      const updated = store.updateFindings(run.id, { environment: env });
      expect(updated.updatedAt > before).toBe(true);
    });

    test("throws SetupRunNotFoundError for unknown id", () => {
      expect(() =>
        store.updateFindings("nonexistent", { environment: { availableProviders: [], usableProviders: [], trackerAdapter: null, devcontainerJsonPresent: false, ghAuthAvailable: false, providerAuthDetails: {} } }),
      ).toThrow(SetupRunNotFoundError);
    });
  });

  describe("complete", () => {
    test("marks run as completed with resolved verdict", () => {
      const run = store.create({ absPath: "/test" });
      const updated = store.complete(run.id);
      expect(updated.status).toBe("completed");
      expect(updated.phase).toBe("completed");
      expect(updated.verdict).toBe("resolved");
      expect(updated.completedAt).not.toBeNull();
    });

    test("throws SetupRunNotActiveError when status is not active", () => {
      const run = store.create({ absPath: "/test" });
      store.complete(run.id);
      expect(() => store.complete(run.id)).toThrow(SetupRunNotActiveError);
    });
  });

  describe("fail", () => {
    test("marks run as failed", () => {
      const run = store.create({ absPath: "/test" });
      const updated = store.fail(run.id);
      expect(updated.status).toBe("failed");
      expect(updated.completedAt).not.toBeNull();
    });
  });

  describe("abandon", () => {
    test("marks run as abandoned", () => {
      const run = store.create({ absPath: "/test" });
      const updated = store.abandon(run.id);
      expect(updated.status).toBe("abandoned");
      expect(updated.completedAt).not.toBeNull();
    });
  });

  describe("delete", () => {
    test("removes the run from disk", () => {
      const run = store.create({ absPath: "/test" });
      store.delete(run.id);
      expect(() => store.get(run.id)).toThrow(SetupRunNotFoundError);
    });

    test("is idempotent for nonexistent run", () => {
      expect(() => store.delete("nonexistent")).not.toThrow();
    });
  });
});
