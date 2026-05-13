/**
 * Runtime extension manifest types.
 *
 * Spec: docs/spec/pipeline.md §Runtime extension manifests
 *       docs/spec/pipeline.md §Exec step manifest format
 */

import type { ContextCapabilities } from "../context/types.ts";
export type { ContextCapabilities } from "../context/types.ts";
export type { ContextProviderManifest } from "../context/types.ts";

export type Runtime = "bun" | "node" | "bash" | "pwsh";

export type Platform = "darwin" | "linux" | "windows";

export type ExecManifest = {
  readonly kind: "exec";
  readonly runtime: Runtime;
  readonly file: string;
  readonly args: readonly string[] | undefined;
  readonly cwd: "worktree" | "repo" | string;
  readonly timeout: string;
  readonly platforms: readonly Platform[] | undefined;
  readonly envAllowlist: readonly string[] | undefined;
  readonly idempotent: boolean;
};

export type RuntimeExtensionManifest = ExecManifest | import("../context/types.ts").ContextProviderManifest;