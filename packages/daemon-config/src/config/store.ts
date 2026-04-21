import {
  loadDaemonConfig,
  saveDaemonConfig,
  type DaemonConfig,
} from "@aloop/config-schema";
import {
  loadOverridesConfig,
  saveOverridesConfig,
  type OverridesConfig,
} from "@aloop/config-schema";
import type { DaemonPaths } from "../paths.ts";

/**
 * Live config view for the running daemon. Holds the most recently loaded
 * daemon.yml and overrides.yml; supports hot reload (POST /v1/daemon/reload)
 * and override mutations (PUT /v1/providers/overrides).
 *
 * The HTTP listener bind/port are NOT hot-reloadable — they are read once at
 * startup. Everything else can mutate at runtime; consumers always go through
 * the store rather than caching their own copy.
 */
export type ConfigStore = {
  /** Current daemon config view. */
  daemon(): DaemonConfig;
  /** Current overrides view. */
  overrides(): OverridesConfig;
  /** Paths the store was created with. */
  paths(): DaemonPaths;

  /** Re-read daemon.yml + overrides.yml from disk. Returns the new state. */
  reload(): ReloadResult;

  /** Replace daemon config in-memory and persist to disk. */
  setDaemon(next: DaemonConfig): DaemonConfig;

  /** Replace overrides in-memory and persist to disk. */
  setOverrides(next: OverridesConfig): OverridesConfig;
};

export type ReloadResult =
  | { ok: true; daemon: DaemonConfig; overrides: OverridesConfig }
  | { ok: false; errors: readonly string[] };

export type CreateConfigStoreOptions = {
  daemon: DaemonConfig;
  overrides: OverridesConfig;
  paths: DaemonPaths;
};

export function createConfigStore(initial: CreateConfigStoreOptions): ConfigStore {
  let daemon = initial.daemon;
  let overrides = initial.overrides;
  const paths = initial.paths;

  return {
    daemon: () => daemon,
    overrides: () => overrides,
    paths: () => paths,

    reload(): ReloadResult {
      const d = loadDaemonConfig(paths.daemonConfigFile);
      const o = loadOverridesConfig(paths.overridesFile);
      const errors: string[] = [];
      if (!d.ok) errors.push(...d.errors.map((e: string) => `daemon.yml: ${e}`));
      if (!o.ok) errors.push(...o.errors.map((e: string) => `overrides.yml: ${e}`));
      if (errors.length > 0) return { ok: false, errors };
      // Both ok: commit atomically.
      if (d.ok) daemon = d.value;
      if (o.ok) overrides = o.value;
      return { ok: true, daemon, overrides };
    },

    setDaemon(next: DaemonConfig): DaemonConfig {
      saveDaemonConfig(paths.daemonConfigFile, next);
      daemon = next;
      return daemon;
    },

    setOverrides(next: OverridesConfig): OverridesConfig {
      saveOverridesConfig(paths.overridesFile, next);
      overrides = next;
      return overrides;
    },
  };
}
