/**
 * Exec step executor.
 *
 * Spawns subprocesses for exec runtime extension manifests, enforcing
 * timeout, environment filtering, and working directory constraints.
 *
 * Spec: docs/spec/pipeline.md §Exec step manifest format
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { ExecManifest } from "@aloop/core";
import { parseTimeoutMs } from "@aloop/core";

export type ExecContext = {
  projectRoot: string;
  worktreeRoot?: string;
};

export type ExecResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

export type ExecuteExecOptions = {
  manifest: ExecManifest;
  context: ExecContext;
  signal?: AbortSignal;
};

function buildEnv(allowlist: readonly string[] | undefined): Record<string, string> | undefined {
  if (!allowlist) return undefined;
  const env: Record<string, string> = {};
  for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

function resolveCwd(cwd: string, context: ExecContext): string {
  if (cwd === "repo") {
    return context.projectRoot;
  }
  if (cwd === "worktree") {
    if (!context.worktreeRoot) {
      throw new Error("exec manifest references cwd=worktree but no worktree is configured");
    }
    return context.worktreeRoot;
  }
  return resolve(context.projectRoot, cwd);
}

function resolveFile(file: string, context: ExecContext, cwd: string): string {
  if (cwd === "worktree" && context.worktreeRoot) {
    return resolve(context.worktreeRoot, file);
  }
  return resolve(context.projectRoot, file);
}

export async function executeExec(opts: ExecuteExecOptions): Promise<ExecResult> {
  const { manifest, context, signal } = opts;
  const cwd = resolveCwd(manifest.cwd, context);
  const timeoutMs = parseTimeoutMs(manifest.timeout);

  const runtimeCmd = manifest.runtime === "bun" ? "bun"
    : manifest.runtime === "node" ? "node"
    : manifest.runtime === "bash" ? "bash"
    : "pwsh";

  const filePath = resolveFile(manifest.file, context, manifest.cwd);
  const extraArgs = manifest.args ?? [];

  let cmdArgs: string[];
  if (manifest.runtime === "bash" || manifest.runtime === "pwsh") {
    cmdArgs = [...extraArgs, filePath];
  } else {
    cmdArgs = [...extraArgs, filePath];
  }

  return new Promise<ExecResult>((resolve) => {
    let timedOut = false;
    let killed = false;

    const spawnOpts: Parameters<typeof spawn>[2] = {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    };
    const env = buildEnv(manifest.envAllowlist);
    if (env) spawnOpts.env = env;

    const child = spawn(runtimeCmd, cmdArgs, spawnOpts);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      if (!killed) {
        killed = true;
        try {
          child.kill("SIGKILL");
        } catch { /* process may have already exited */ }
      }
    }, timeoutMs);

    if (signal) {
      signal.addEventListener("abort", () => {
        if (!killed) {
          killed = true;
          try {
            child.kill("SIGKILL");
          } catch { /* process may have already exited */ }
        }
      });
    }

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code,
        timedOut,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8") + "\n" + err.message,
        exitCode: null,
        timedOut,
      });
    });
  });
}