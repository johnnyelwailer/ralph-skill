import { spawn } from "node:child_process";
import type {
  TrackerAdapter,
  TrackerId,
  TrackerHealth,
  WorkItemFilter,
  WorkItem,
  WorkItemRef,
  WorkItemDraft,
  WorkItemPatch,
  ChangeSetRef,
  ChangeSet,
  ChangeSetDraft,
  ChangeSetFilter,
  Comment,
  CommentRef,
  TaskSnapshot,
  LinkChildOptions,
  WorkItemChildrenSummary,
  TrackerCapabilities,
  LinePosition,
  MergeMode,
  MergeResult,
  TrackerEventFilter,
  TrackerEvent,
} from "../types.js";
import type {
  GitHubConfig,
  GitHubIssue,
  GitHubSubIssuesSummary,
  GitHubPullRequest,
  GitHubComment,
} from "./types.js";

export interface CreateGitHubAdapterOptions {
  config: GitHubConfig;
  statusMap?: Record<string, { state: string; metadata?: Record<string, unknown>; requireAssignee?: boolean; requireLinkedChangeSet?: boolean }>;
  labelMap?: Record<string, string>;
  projectId?: string;
}

function ghCapabilities(): TrackerCapabilities {
  return {
    work_items: true,
    labels: true,
    comments: true,
    assignees: true,
    change_sets: true,
    change_set_reviews: true,
    subscribe_events: true,
    hierarchy: {
      native: true,
      max_depth: 8,
      max_children_per_parent: 100,
      single_parent_only: true,
      cross_repo_allowed: false,
    },
    tracks_tasks: {
      mirror_supported: true,
      mirror_shape: "sub_children",
      max_tasks_per_story: 50,
    },
    milestones: false,
    projects_boards: false,
    max_body_bytes: 65536,
  };
}

async function ghGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      args.push("-f", `${key}=${JSON.stringify(value)}`);
    }
  }
  const result = await gh(args);
  return JSON.parse(result) as T;
}

async function gh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gh ${args.join(" ")} failed: ${stderr}`));
    });
  });
}

async function ghREST<T>(method: string, path: string, body?: unknown): Promise<T> {
  const args = ["api", "--method", method, path];
  if (body) {
    args.push("-f", `input=${JSON.stringify(body)}`);
  }
  const result = await gh(args);
  return JSON.parse(result) as T;
}

function parseRepo(config: GitHubConfig): { owner: string; repo: string } {
  const parts = config.repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Invalid repo format: ${config.repo}`);
  return { owner: parts[0]!, repo: parts[1]! };
}

function toWorkItem(issue: GitHubIssue, repo: string): WorkItem {
  return {
    ref: {
      adapter: "github",
      key: String(issue.number),
      url: `https://github.com/${repo}/issues/${issue.number}`,
    },
    kind: issue.parent ? "story" : "epic",
    title: issue.title,
    body: issue.body ?? "",
    state: issue.state === "open" ? "open" : "closed",
    labels: issue.labels.map((l) => l.name),
    assignees: issue.assignees.map((a) => a.login),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    ...(issue.closed_at && { closed_at: issue.closed_at }),
    links: {
      ...(issue.parent && { parent: { adapter: "github" as const, key: String(issue.parent.number) } }),
    },
    metadata: {},
  };
}

function toChangeSet(pr: GitHubPullRequest): ChangeSet {
  return {
    ref: {
      adapter: "github",
      key: String(pr.number),
      url: pr.html_url,
    },
    title: pr.title,
    body: pr.body ?? "",
    state: pr.state === "merged" ? "merged" : pr.state === "open" ? "open" : "closed",
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    author: pr.user.login,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    ...(pr.merged_at && { merged_at: pr.merged_at }),
    labels: pr.labels.map((l) => l.name),
    url: pr.html_url,
    metadata: {},
  };
}

function toComment(comment: GitHubComment, repo: string, number: number): CommentRef {
  return {
    id: String(comment.id),
    url: `https://github.com/${repo}/issues/${number}#issuecomment-${comment.id}`,
  };
}

export function createGitHubAdapter(options: CreateGitHubAdapterOptions): TrackerAdapter {
  const { config } = options;
  const { owner, repo } = parseRepo(config);
  const repoSlug = `${owner}/${repo}`;
  const projectId = options.projectId ?? `github:${owner}/${repo}`;
  const pollIntervalMs = (config.polling?.intervalSeconds ?? 30) * 1000;

  async function fetchIssue(number: number): Promise<GitHubIssue> {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            number title body state createdAt updatedAt closedAt
            labels(first: 100) { nodes { name } }
            assignees(first: 100) { nodes { login } }
            parent { number repository { name owner { login } } }
          }
        }
      }
    `;
    const data = await ghGraphql<{ repository: { issue: GitHubIssue } }>(query, { owner, repo, number });
    return data.repository.issue;
  }

  return {
    id: "github" as TrackerId,
    capabilities: ghCapabilities(),

    async ping(): Promise<TrackerHealth> {
      try {
        await gh(["auth", "status"]);
        return { status: "healthy" };
      } catch {
        return { status: "unavailable", message: "gh auth failed" };
      }
    },

    async *listWorkItems(filter: WorkItemFilter): AsyncIterable<WorkItem> {
      const stateFilter = filter.state ? `state:${filter.state}` : "state:open";
      const kindFilter = filter.kind ? `kind:${Array.isArray(filter.kind) ? filter.kind.join(",") : filter.kind}` : "";
      const labelFilter = filter.labels?.length ? filter.labels.map((l) => `label:"${l}"`).join(" ") : "";

      let query = `repo:${repoSlug} ${stateFilter} is:issue`;
      if (labelFilter) query += ` ${labelFilter}`;
      if (filter.assignee) query += ` assignee:${filter.assignee}`;

      const result = await gh(["issue", "list", "--limit", String(filter.limit ?? 100), "--json", "number,title,body,state,labels,assignees,createdAt,updatedAt,closedAt,parent", "--search", query]);
      const issues = JSON.parse(result) as GitHubIssue[];

      for (const issue of issues) {
        const item = toWorkItem(issue, repoSlug);
        if (filter.kind !== undefined) {
          const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
          if (!kinds.includes(item.kind)) continue;
        }
        yield item;
      }
    },

    async getWorkItem(ref: WorkItemRef): Promise<WorkItem> {
      const number = parseInt(ref.key, 10);
      const issue = await fetchIssue(number);
      return toWorkItem(issue, repoSlug);
    },

    async *listComments(ref: WorkItemRef): AsyncIterable<Comment> {
      const number = parseInt(ref.key, 10);
      const result = await gh(["issue", "comment", "list", "--limit", "100", "--json", "id,body,user,createdAt,updatedAt", "--repo", repoSlug, String(number)]);
      const comments = JSON.parse(result) as GitHubComment[];
      for (const comment of comments) {
        yield {
          ref: toComment(comment, repoSlug, number),
          body: comment.body,
          author: comment.user.login,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
        };
      }
    },

    async *listLinkedChangeSets(ref: WorkItemRef): AsyncIterable<ChangeSetRef> {
      const number = parseInt(ref.key, 10);
      const query = `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              linkedPullRequests(first: 20) {
                nodes {
                  number state title body base { ref } head { ref }
                  user { login } createdAt updatedAt mergedAt
                  labels(first: 20) { nodes { name } } htmlUrl
                }
              }
            }
          }
        }
      `;
      const data = await ghGraphql<{ repository: { issue: { linkedPullRequests: { nodes: GitHubPullRequest[] } } } }>(query, { owner, repo, number });
      for (const pr of data.repository.issue.linkedPullRequests.nodes) {
        yield { adapter: "github", key: String(pr.number), url: pr.html_url };
      }
    },

    async getParent(ref: WorkItemRef): Promise<WorkItemRef | null> {
      const issue = await fetchIssue(parseInt(ref.key, 10));
      return issue.parent ? { adapter: "github", key: String(issue.parent.number) } : null;
    },

    async *listChildren(ref: WorkItemRef): AsyncIterable<WorkItem> {
      const number = parseInt(ref.key, 10);
      const query = `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              subIssues(first: 100) {
                nodes {
                  number title body state createdAt updatedAt closedAt
                  labels(first: 100) { nodes { name } }
                  assignees(first: 100) { nodes { login } }
                }
              }
            }
          }
        }
      `;
      const data = await ghGraphql<{ repository: { issue: { subIssues: { nodes: GitHubIssue[] } } } }>(query, { owner, repo, number });
      for (const issue of data.repository.issue.subIssues.nodes) {
        yield toWorkItem(issue, repoSlug);
      }
    },

    async linkChild(parent: WorkItemRef, child: WorkItemRef, _opts?: LinkChildOptions): Promise<void> {
      const parentNum = parseInt(parent.key, 10);
      const childNum = parseInt(child.key, 10);
      await gh(["api", "--method", "POST", `/repos/${repoSlug}/issues/${parentNum}/sub_issues`, "-f", `sub_issue_id=${childNum}`]);
    },

    async unlinkChild(parent: WorkItemRef, child: WorkItemRef): Promise<void> {
      const parentNum = parseInt(parent.key, 10);
      const childNum = parseInt(child.key, 10);
      await gh(["api", "--method", "DELETE", `/repos/${repoSlug}/issues/${parentNum}/sub_issue`, "-f", `sub_issue_id=${childNum}`]);
    },

    async reorderChild(_parent: WorkItemRef, _child: WorkItemRef, _after?: WorkItemRef, _before?: WorkItemRef): Promise<void> {
      void _parent; void _child; void _after; void _before;
    },

    async childrenSummary(ref: WorkItemRef): Promise<WorkItemChildrenSummary> {
      const number = parseInt(ref.key, 10);
      const query = `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) {
              subIssuesSummary { total completed percentCompleted }
            }
          }
        }
      `;
      const data = await ghGraphql<{ repository: { issue: { subIssuesSummary: GitHubSubIssuesSummary } } }>(query, { owner, repo, number });
      return { total: data.repository.issue.subIssuesSummary.total, completed: data.repository.issue.subIssuesSummary.completed };
    },

    async createWorkItem(draft: WorkItemDraft): Promise<WorkItemRef> {
      const body: Record<string, unknown> = {
        title: draft.title,
        body: draft.body,
        labels: draft.labels ?? [],
      };
      const result = await ghREST<{ number: number }>("POST", `/repos/${repoSlug}/issues`, body);
      const ref: WorkItemRef = { adapter: "github", key: String(result.number), url: `https://github.com/${repoSlug}/issues/${result.number}` };

      if (draft.parent) {
        await this.linkChild(draft.parent, ref);
      }

      return ref;
    },

    async updateWorkItem(ref: WorkItemRef, patch: WorkItemPatch): Promise<void> {
      const number = parseInt(ref.key, 10);
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.body !== undefined) body.body = patch.body;
      if (patch.state !== undefined) body.state = patch.state === "closed" ? "closed" : "open";
      if (patch.labels !== undefined) body.labels = patch.labels;
      if (patch.assignees !== undefined) body.assignees = patch.assignees;
      await ghREST("PATCH", `/repos/${repoSlug}/issues/${number}`, body);
    },

    async addComment(ref: WorkItemRef, body: string, _opts?: { artifact_refs?: readonly import("../types.js").CommentArtifactRef[] }): Promise<CommentRef> {
      const number = parseInt(ref.key, 10);
      const result = await ghREST<{ id: number }>("POST", `/repos/${repoSlug}/issues/${number}/comments`, { body });
      return { id: String(result.id), url: `https://github.com/${repoSlug}/issues/${number}#issuecomment-${result.id}` };
    },

    async addLabel(ref: WorkItemRef, label: string): Promise<void> {
      const number = parseInt(ref.key, 10);
      await gh(["issue", "add-label", label, "--repo", repoSlug, String(number)]);
    },

    async removeLabel(ref: WorkItemRef, label: string): Promise<void> {
      const number = parseInt(ref.key, 10);
      await gh(["issue", "remove-label", label, "--repo", repoSlug, String(number)]);
    },

    async setAssignees(ref: WorkItemRef, assignees: readonly string[]): Promise<void> {
      const number = parseInt(ref.key, 10);
      const loginList = assignees.join(",");
      await gh(["issue", "edit", "--repo", repoSlug, String(number), "--add-assignee", loginList]);
    },

    async closeWorkItem(ref: WorkItemRef, _reason?: "completed" | "not_planned"): Promise<void> {
      const number = parseInt(ref.key, 10);
      await ghREST("PATCH", `/repos/${repoSlug}/issues/${number}`, { state: "closed" });
    },

    async reopenWorkItem(ref: WorkItemRef): Promise<void> {
      const number = parseInt(ref.key, 10);
      await ghREST("PATCH", `/repos/${repoSlug}/issues/${number}`, { state: "open" });
    },

    async createChangeSet(draft: ChangeSetDraft): Promise<ChangeSetRef> {
      const result = await ghREST<{ number: number; html_url: string }>("POST", `/repos/${repoSlug}/pulls`, {
        title: draft.title,
        body: draft.body ?? "",
        base: draft.baseBranch ?? config.defaultBaseBranch ?? "master",
        head: draft.headBranch,
        labels: draft.labels ?? [],
      });
      return { adapter: "github", key: String(result.number), url: result.html_url };
    },

    async getChangeSet(ref: ChangeSetRef): Promise<ChangeSet> {
      const number = parseInt(ref.key, 10);
      const result = await gh(["pr", "view", "--json", "number,title,body,state,base,head,user,createdAt,updatedAt,mergedAt,labels,url", "--repo", repoSlug, String(number)]);
      return toChangeSet(JSON.parse(result) as GitHubPullRequest);
    },

    async *listChangeSets(filter: ChangeSetFilter): AsyncIterable<ChangeSet> {
      const stateFilter = filter.state ? filter.state === "merged" ? "is:merged" : filter.state === "closed" ? "is:closed" : "is:open" : "is:open";
      const search = `repo:${repoSlug} is:pr ${stateFilter}`;
      const result = await gh(["pr", "list", "--limit", String(filter.limit ?? 100), "--json", "number,title,body,state,base,head,user,createdAt,updatedAt,mergedAt,labels,url", "--search", search]);
      const prs = JSON.parse(result) as GitHubPullRequest[];
      for (const pr of prs) {
        yield toChangeSet(pr);
      }
    },

    async addChangeSetComment(ref: ChangeSetRef, body: string, _position?: LinePosition, _opts?: { artifact_refs?: readonly import("../types.js").CommentArtifactRef[] }): Promise<CommentRef> {
      const number = parseInt(ref.key, 10);
      const result = await ghREST<{ id: number }>("POST", `/repos/${repoSlug}/pulls/${number}/comments`, { body });
      return { id: String(result.id) };
    },

    resolveChangeSetThread(_ref: CommentRef): Promise<void> {
      return Promise.resolve();
    },

    updateChangeSetBranch(_ref: ChangeSetRef): Promise<void> {
      return Promise.resolve();
    },

    async mergeChangeSet(ref: ChangeSetRef, mode: MergeMode): Promise<MergeResult> {
      const number = parseInt(ref.key, 10);
      const mergeMethod = mode === "squash" ? "squash" : mode === "fast_forward" ? "fast-forward" : "merge";
      const result = await ghREST<{ merged: boolean; sha: string; message: string }>("PUT", `/repos/${repoSlug}/pulls/${number}/merge`, { merge_method: mergeMethod });
      return { merged: result.merged, merge_sha: result.sha, message: result.message };
    },

    closeChangeSet(ref: ChangeSetRef): Promise<void> {
      const number = parseInt(ref.key, 10);
      return ghREST("PATCH", `/repos/${repoSlug}/pulls/${number}`, { state: "closed" }).then(() => undefined);
    },

    async mirrorTasks(_story: WorkItemRef, _tasks: readonly TaskSnapshot[]): Promise<void> {
      void _story; void _tasks;
    },

    async *readMirroredTasks(_story: WorkItemRef): AsyncIterable<TaskSnapshot> {
    },

    async *subscribe(filter: TrackerEventFilter): AsyncGenerator<TrackerEvent> {
      const topicKindMap: Record<string, TrackerEvent["data"]["kind"]> = {
        "issues": "work_item.updated",
        "issue_comment": "comment.created",
        "pull_request": "change_set.opened",
        "pull_request_review": "change_set.review_submitted",
        "pull_request_review_thread": "change_set.review_thread_resolved",
        "merge": "change_set.merged",
      };

      const lastEventPath = `/tmp/gh-adapter-last-event-${owner}-${repo}`;
      let lastTimestamp = "";
      try {
        lastTimestamp = await Bun.file(lastEventPath).text();
      } catch {
        lastTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      }

      const seen = new Set<string>();

      while (true) {
        try {
          const result = await gh(["event", "list", "--limit", "30", "--repo", repoSlug]);
          const lines = result.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            const match = line.match(/^(\w+)\s+(.+?)\s+(\d+\s+\w+\s+ago)\s*$/);
            if (!match || !match[1] || !match[2] || !match[3]) continue;
            const eventType = match[1];
            void match[2];
            const ageStr = match[3];
            if (seen.has(line)) continue;
            seen.add(line);
            const eventTime = parseGitHubAge(ageStr);
            if (eventTime <= lastTimestamp) continue;
            const kind = topicKindMap[eventType] ?? "work_item.updated";
            if (filter.topics !== undefined && !filter.topics.includes(kind)) continue;
            yield {
              topic: kind,
              data: {
                adapter: "github" as TrackerId,
                project_id: projectId,
                kind,
                received_at: new Date().toISOString(),
              },
            };
            if (eventTime > lastTimestamp) lastTimestamp = eventTime;
          }
        } catch {
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    },
  };
}

function parseGitHubAge(ageStr: string): string {
  const match = ageStr.match(/(\d+)\s+(\w+)\s+ago/);
  if (!match || !match[1] || !match[2]) return new Date(0).toISOString();
  const value = parseInt(match[1], 10);
  const unit = match[2].replace(/s$/, "");
  const msTable: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_629_746_000,
    year: 31_556_952_000,
  };
  const ms = msTable[unit] ?? 60_000;
  return new Date(Date.now() - value * ms).toISOString();
}