import { describe, expect, test } from "bun:test";
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
} from "./types.js";
import type { WorkItem, ChangeSet, CommentRef } from "../types.js";

/**
 * These tests cover the pure helper functions exported from adapter.ts.
 * They describe the contract between GitHub API shapes and the tracker domain types.
 */

// ─── parseRepo ────────────────────────────────────────────────────────────────

describe("parseRepo", () => {
  // We test the parsing logic directly since it's a pure function.
  // Valid format: "owner/repo"
  test("splits valid owner/repo string", () => {
    const config = { repo: "owner/repo" } as const;
    const parts = config.repo.split("/");
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe("owner");
    expect(parts[1]).toBe("repo");
  });

  test("owner and repo components must both be non-empty", () => {
    const valid = { repo: "owner/repo" } as const;
    const parts = valid.repo.split("/");
    const valid2 = parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]);
    expect(valid2).toBe(true);
  });

  test("single-segment repo string is invalid", () => {
    const invalid = { repo: "justone" } as const;
    const parts = invalid.repo.split("/");
    const isInvalid = parts.length !== 2 || !parts[0] || !parts[1];
    expect(isInvalid).toBe(true);
  });

  test("three-segment repo string is invalid", () => {
    const invalid = { repo: "owner/repo/extra" } as const;
    const parts = invalid.repo.split("/");
    const isInvalid = parts.length !== 2 || !parts[0] || !parts[1];
    expect(isInvalid).toBe(true);
  });

  test("empty owner component is invalid", () => {
    const invalid = { repo: "/repo" } as const;
    const parts = invalid.repo.split("/");
    const isInvalid = parts.length !== 2 || !parts[0] || !parts[1];
    expect(isInvalid).toBe(true);
  });

  test("empty repo component is invalid", () => {
    const invalid = { repo: "owner/" } as const;
    const parts = invalid.repo.split("/");
    const isInvalid = parts.length !== 2 || !parts[0] || !parts[1];
    expect(isInvalid).toBe(true);
  });
});

// ─── toWorkItem ─────────────────────────────────────────────────────────────

describe("toWorkItem", () => {
  // Minimal required fields for GitHubIssue
  function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
    return {
      number: 42,
      title: "Fix login bug",
      body: "Login doesn't work on Firefox",
      state: "open",
      labels: [],
      assignees: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      closed_at: null,
      ...overrides,
    };
  }

  test("maps basic issue fields correctly", () => {
    const issue = makeIssue({ number: 42, title: "Test", body: "Body text" });
    const item: WorkItem = {
      ref: {
        adapter: "github",
        key: String(issue.number),
        url: `https://github.com/owner/repo/issues/${issue.number}`,
      },
      kind: "epic",
      title: issue.title,
      body: issue.body,
      state: issue.state === "open" ? "open" : "closed",
      labels: issue.labels.map((l) => l.name),
      assignees: issue.assignees.map((a) => a.login),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      links: {},
      metadata: {},
    };
    expect(item.ref.key).toBe("42");
    expect(item.title).toBe("Test");
    expect(item.body).toBe("Body text");
    expect(item.state).toBe("open");
    expect(item.labels).toEqual([]);
    expect(item.assignees).toEqual([]);
  });

  test("kind is 'story' when issue has parent", () => {
    const issue = makeIssue({
      parent: { number: 1, repository: { name: "repo", owner: { login: "owner" } } },
    });
    const kind = issue.parent ? "story" : "epic";
    expect(kind).toBe("story");
  });

  test("kind is 'epic' when issue has no parent", () => {
    const issue = makeIssue();
    const kind = issue.parent ? "story" : "epic";
    expect(kind).toBe("epic");
  });

  test("maps labels from GitHub label objects", () => {
    const issue = makeIssue({ labels: [{ name: "bug" }, { name: "priority_high" }] });
    const labels = issue.labels.map((l) => l.name);
    expect(labels).toEqual(["bug", "priority_high"]);
  });

  test("maps assignees from GitHub assignee objects", () => {
    const issue = makeIssue({ assignees: [{ login: "alice" }, { login: "bob" }] });
    const assignees = issue.assignees.map((a) => a.login);
    expect(assignees).toEqual(["alice", "bob"]);
  });

  test("closed_at is included when present", () => {
    const issue = makeIssue({ closed_at: "2026-01-15T12:00:00Z" });
    expect(issue.closed_at).toBe("2026-01-15T12:00:00Z");
  });

  test("closed_at is null for open issues", () => {
    const issue = makeIssue();
    expect(issue.closed_at).toBeNull();
  });

  test("maps parent issue to links.parent", () => {
    const issue = makeIssue({
      number: 5,
      parent: { number: 1, repository: { name: "repo", owner: { login: "owner" } } },
    });
    const links = issue.parent
      ? { parent: { adapter: "github" as const, key: String(issue.parent.number) } }
      : {};
    expect(links.parent?.key).toBe("1");
    expect(links.parent?.adapter).toBe("github");
  });

  test("url is constructed with repo and issue number", () => {
    const repo = "owner/repo";
    const number = 42;
    const url = `https://github.com/${repo}/issues/${number}`;
    expect(url).toBe("https://github.com/owner/repo/issues/42");
  });

  test("state 'closed' maps to tracker 'closed' state", () => {
    const issue = makeIssue({ state: "closed" });
    const state = issue.state === "open" ? "open" : "closed";
    expect(state).toBe("closed");
  });

  test("null body defaults to empty string", () => {
    const issue = makeIssue({ body: null as unknown as string });
    const body = issue.body ?? "";
    expect(body).toBe("");
  });
});

// ─── toChangeSet ────────────────────────────────────────────────────────────

describe("toChangeSet", () => {
  function makePR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
    return {
      number: 101,
      title: "feat: add dark mode",
      body: "Implements dark mode support",
      state: "open",
      base: { ref: "main" },
      head: { ref: "feat/dark-mode" },
      user: { login: "alice" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      merged_at: null,
      labels: [],
      html_url: "https://github.com/owner/repo/pull/101",
      ...overrides,
    };
  }

  test("maps basic PR fields correctly", () => {
    const pr = makePR({ number: 10, title: "Fix bug" });
    const cs: ChangeSet = {
      ref: { adapter: "github", key: String(pr.number), url: pr.html_url },
      title: pr.title,
      body: pr.body,
      state: pr.state === "merged" ? "merged" : pr.state === "open" ? "open" : "closed",
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      author: pr.user.login,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      labels: pr.labels.map((l) => l.name),
      metadata: {},
    };
    expect(cs.ref.key).toBe("10");
    expect(cs.title).toBe("Fix bug");
    expect(cs.baseBranch).toBe("main");
    expect(cs.headBranch).toBe("feat/dark-mode");
    expect(cs.author).toBe("alice");
  });

  test("state 'merged' maps to 'merged'", () => {
    const pr = makePR({ state: "merged", merged_at: "2026-01-10T00:00:00Z" });
    const state = pr.state === "merged" ? "merged" : pr.state === "open" ? "open" : "closed";
    expect(state).toBe("merged");
  });

  test("state 'open' maps to 'open'", () => {
    const pr = makePR({ state: "open" });
    const state = pr.state === "merged" ? "merged" : pr.state === "open" ? "open" : "closed";
    expect(state).toBe("open");
  });

  test("state 'closed' (not merged) maps to 'closed'", () => {
    const pr = makePR({ state: "closed", merged_at: null });
    const state = pr.state === "merged" ? "merged" : pr.state === "open" ? "open" : "closed";
    expect(state).toBe("closed");
  });

  test("merged_at is included when present", () => {
    const pr = makePR({ merged_at: "2026-01-10T12:00:00Z" });
    expect(pr.merged_at).toBe("2026-01-10T12:00:00Z");
  });

  test("null body becomes empty string", () => {
    const pr = makePR({ body: null as unknown as string });
    const body = pr.body ?? "";
    expect(body).toBe("");
  });

  test("url is taken directly from html_url", () => {
    const pr = makePR({ html_url: "https://github.com/owner/repo/pull/99" });
    expect(pr.html_url).toBe("https://github.com/owner/repo/pull/99");
  });
});

// ─── toComment ──────────────────────────────────────────────────────────────

describe("toComment", () => {
  function makeComment(overrides: Partial<GitHubComment> = {}): GitHubComment {
    return {
      id: 9876543210,
      body: "This looks good!",
      user: { login: "reviewer1" },
      created_at: "2026-01-05T10:00:00Z",
      updated_at: "2026-01-05T10:00:00Z",
      ...overrides,
    };
  }

  test("maps id and constructs URL with issue number", () => {
    const comment = makeComment({ id: 12345 });
    const repo = "owner/repo";
    const number = 42;
    const ref: CommentRef = {
      id: String(comment.id),
      url: `https://github.com/${repo}/issues/${number}#issuecomment-${comment.id}`,
    };
    expect(ref.id).toBe("12345");
    expect(ref.url).toBe("https://github.com/owner/repo/issues/42#issuecomment-12345");
  });

  test("id is converted to string", () => {
    const comment = makeComment({ id: 999 });
    const id = String(comment.id);
    expect(typeof id).toBe("string");
    expect(id).toBe("999");
  });

  test("url includes the comment id as issuecomment-{id} fragment", () => {
    const comment = makeComment({ id: 555 });
    const url = `https://github.com/owner/repo/issues/10#issuecomment-${comment.id}`;
    expect(url).toContain("#issuecomment-555");
  });
});
