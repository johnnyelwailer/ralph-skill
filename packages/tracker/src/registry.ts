import path from "node:path";
import { createBuiltinAdapter, type CreateBuiltinAdapterOptions } from "./builtin-adapter.ts";
import type { TrackerAdapter, TrackerId } from "./types.js";

export type TrackerFactory = (
  projectId: string,
) => TrackerAdapter | Promise<TrackerAdapter>;

export type CreateTrackerRegistryOptions = {
  readonly trackersRoot: string;
  readonly factories?: Readonly<Record<TrackerId, TrackerFactory>>;
};

/**
 * TrackerRegistry owns the live `TrackerAdapter` instance for each project.
 *
 * - One adapter per project; the active tracker is recorded per project and
 *   looked up on every operation.
 * - The default tracker is `builtin` — a JSON-files-on-disk adapter rooted at
 *   `<trackersRoot>/<projectId>/.aloop/tracker/`. This makes the offline
 *   minimum flow testable without an external tracker.
 * - Adding a new tracker (e.g. `github`) is a matter of supplying a factory
 *   through `factories`; no daemon code changes.
 */
export class TrackerRegistry {
  private readonly instances = new Map<string, TrackerAdapter>();
  private readonly projectTrackers = new Map<string, TrackerId>();
  private readonly factories: Record<TrackerId, TrackerFactory>;

  constructor(private readonly opts: CreateTrackerRegistryOptions) {
    this.factories = {
      builtin: (projectId) =>
        createBuiltinAdapter({
          root: path.join(opts.trackersRoot, projectId, ".aloop", "tracker"),
          projectId,
        }),
      ...(opts.factories ?? {}),
    };
  }

  listSupported(): readonly TrackerId[] {
    return Object.keys(this.factories);
  }

  getTrackerId(projectId: string): TrackerId {
    return this.projectTrackers.get(projectId) ?? "builtin";
  }

  setTrackerId(projectId: string, trackerId: TrackerId): void {
    if (!this.factories[trackerId]) {
      throw new Error(`Unknown tracker_id: ${trackerId}; supported: ${this.listSupported().join(", ")}`);
    }
    this.projectTrackers.set(projectId, trackerId);
    this.instances.delete(projectId);
  }

  async getAdapter(projectId: string): Promise<TrackerAdapter> {
    const cached = this.instances.get(projectId);
    if (cached) return cached;
    const trackerId = this.getTrackerId(projectId);
    const factory = this.factories[trackerId];
    if (!factory) throw new Error(`No factory for tracker_id: ${trackerId}`);
    const adapter = await factory(projectId);
    this.instances.set(projectId, adapter);
    return adapter;
  }

  /**
   * Discard the cached adapter instance for a project.  Useful when a project
   * is reconfigured to use a different tracker.
   */
  invalidate(projectId: string): void {
    this.instances.delete(projectId);
  }
}

export type { CreateBuiltinAdapterOptions };
