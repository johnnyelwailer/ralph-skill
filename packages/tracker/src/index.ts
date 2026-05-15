/**
 * @aloop/tracker — TrackerAdapter interface and supporting types.
 *
 * Implements the interface defined in `docs/spec/work-tracker.md`.
 *
 * Package exports:
 * - `TrackerAdapter` — the main interface
 * - All generic data shapes (WorkItem, ChangeSet, Comment, etc.)
 * - Capability and health types
 */
export {
  createBuiltinAdapter,
  type CreateBuiltinAdapterOptions,
} from "./builtin-adapter.ts";
export {
  createGitHubAdapter,
  type CreateGitHubAdapterOptions,
} from "./github/adapter.ts";
export type {
  GitHubConfig,
} from "./github/types.js";
export type {
  TrackerId,
  WorkItemRef,
  WorkItemKind,
  WorkItem,
  WorkItemDraft,
  WorkItemPatch,
  WorkItemFilter,
  WorkItemChildrenSummary,
  LinkChildOptions,
  ChangeSetRef,
  ChangeSetState,
  ChangeSet,
  ChangeSetDraft,
  ChangeSetFilter,
  MergeMode,
  MergeResult,
  LinePosition,
  CommentArtifactRef,
  CommentRef,
  Comment,
  TaskSnapshot,
  TrackerCapabilities,
  TrackerHealth,
  TrackerEventFilter,
  TrackerEvent,
  TrackerAdapter,
} from "./types.ts";
