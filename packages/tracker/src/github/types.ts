export type GitHubConfig = {
  readonly repo: string;
  readonly defaultBaseBranch?: string;
  readonly authMethod?: "gh-cli" | "token";
  readonly token?: string;
  readonly rateLimit?: {
    readonly maxRequestsPerMinute?: number;
  };
  readonly webhook?: {
    readonly enabled?: boolean;
    readonly secretEnv?: string;
  };
  readonly polling?: {
    readonly enabled?: boolean;
    readonly intervalSeconds?: number;
  };
};

export type GitHubIssue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: "open" | "closed";
  readonly labels: { name: string }[];
  readonly assignees: { login: string }[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null | undefined;
  readonly parent?: { number: number; repository: { name: string; owner: { login: string } } };
};

export type GitHubSubIssuesSummary = {
  readonly total: number;
  readonly completed: number;
  readonly percentCompleted: number;
};

export type GitHubPullRequest = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: "open" | "closed" | "merged";
  readonly base: { ref: string };
  readonly head: { ref: string };
  readonly user: { login: string };
  readonly created_at: string;
  readonly updated_at: string;
  readonly merged_at: string | null;
  readonly labels: { name: string }[];
  readonly html_url: string;
};

export type GitHubComment = {
  readonly id: number;
  readonly body: string;
  readonly user: { login: string };
  readonly created_at: string;
  readonly updated_at: string;
};

export type GitHubReviewComment = {
  readonly id: number;
  readonly body: string;
  readonly path: string;
  readonly line: number | null;
  readonly user: { login: string };
  readonly created_at: string;
  readonly updated_at: string;
};

export type GitHubLabel = {
  readonly id: number;
  readonly name: string;
};