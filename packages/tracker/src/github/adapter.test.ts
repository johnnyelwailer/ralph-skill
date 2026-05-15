import { describe, expect, test } from "bun:test";
import { createGitHubAdapter } from "./adapter.js";

describe("createGitHubAdapter", () => {
  describe("id and capabilities", () => {
    test("has id 'github'", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.id).toBe("github");
    });

    test("declares work_items capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.work_items).toBe(true);
    });

    test("declares labels capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.labels).toBe(true);
    });

    test("declares comments capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.comments).toBe(true);
    });

    test("declares assignees capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.assignees).toBe(true);
    });

    test("declares change_sets capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.change_sets).toBe(true);
    });

    test("declares change_set_reviews capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.change_set_reviews).toBe(true);
    });

    test("declares native hierarchy capability", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.hierarchy.native).toBe(true);
    });

    test("declares hierarchy max_depth of 8", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.hierarchy.max_depth).toBe(8);
    });

    test("declares hierarchy max_children_per_parent of 100", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.hierarchy.max_children_per_parent).toBe(100);
    });

    test("declares single_parent_only as true", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.hierarchy.single_parent_only).toBe(true);
    });

    test("declares cross_repo_allowed as false", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.hierarchy.cross_repo_allowed).toBe(false);
    });

    test("declares tracks_tasks with mirror_supported", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.tracks_tasks.mirror_supported).toBe(true);
    });

    test("declares tracks_tasks with sub_children mirror_shape", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.tracks_tasks.mirror_shape).toBe("sub_children");
    });

    test("declares max_tasks_per_story of 50", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.tracks_tasks.max_tasks_per_story).toBe(50);
    });

    test("declares milestones as false", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.milestones).toBe(false);
    });

    test("declares projects_boards as false", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.projects_boards).toBe(false);
    });

    test("declares max_body_bytes as 65536", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(adapter.capabilities.max_body_bytes).toBe(65536);
    });
  });

  describe("config parsing", () => {
    test("accepts valid repo format owner/repo", () => {
      const adapter = createGitHubAdapter({ config: { repo: "johnny/repo-name" } });
      expect(adapter.id).toBe("github");
    });

    test("accepts repo with defaultBaseBranch", () => {
      const adapter = createGitHubAdapter({
        config: { repo: "owner/repo", defaultBaseBranch: "main" },
      });
      expect(adapter.id).toBe("github");
    });
  });

  describe("implements TrackerAdapter interface", () => {
    test("has ping method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.ping).toBe("function");
    });

    test("has listWorkItems method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.listWorkItems).toBe("function");
    });

    test("has getWorkItem method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.getWorkItem).toBe("function");
    });

    test("has listComments method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.listComments).toBe("function");
    });

    test("has listLinkedChangeSets method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.listLinkedChangeSets).toBe("function");
    });

    test("has getParent method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.getParent).toBe("function");
    });

    test("has listChildren method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.listChildren).toBe("function");
    });

    test("has linkChild method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.linkChild).toBe("function");
    });

    test("has unlinkChild method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.unlinkChild).toBe("function");
    });

    test("has reorderChild method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.reorderChild).toBe("function");
    });

    test("has childrenSummary method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.childrenSummary).toBe("function");
    });

    test("has createWorkItem method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.createWorkItem).toBe("function");
    });

    test("has updateWorkItem method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.updateWorkItem).toBe("function");
    });

    test("has addComment method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.addComment).toBe("function");
    });

    test("has addLabel method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.addLabel).toBe("function");
    });

    test("has removeLabel method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.removeLabel).toBe("function");
    });

    test("has setAssignees method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.setAssignees).toBe("function");
    });

    test("has closeWorkItem method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.closeWorkItem).toBe("function");
    });

    test("has reopenWorkItem method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.reopenWorkItem).toBe("function");
    });

    test("has createChangeSet method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.createChangeSet).toBe("function");
    });

    test("has getChangeSet method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.getChangeSet).toBe("function");
    });

    test("has listChangeSets method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.listChangeSets).toBe("function");
    });

    test("has addChangeSetComment method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.addChangeSetComment).toBe("function");
    });

    test("has resolveChangeSetThread method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.resolveChangeSetThread).toBe("function");
    });

    test("has updateChangeSetBranch method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.updateChangeSetBranch).toBe("function");
    });

    test("has mergeChangeSet method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.mergeChangeSet).toBe("function");
    });

    test("has closeChangeSet method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.closeChangeSet).toBe("function");
    });

    test("has mirrorTasks method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.mirrorTasks).toBe("function");
    });

    test("has readMirroredTasks method", () => {
      const adapter = createGitHubAdapter({ config: { repo: "owner/repo" } });
      expect(typeof adapter.readMirroredTasks).toBe("function");
    });
  });
});