export type OpencodeRunInput = {
  readonly modelId: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly command?: string;
};

export type OpencodeRunResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly usage?: {
        readonly tokensIn?: number;
        readonly tokensOut?: number;
        readonly cacheRead?: number;
        readonly costUsd?: number;
      };
      readonly stderr?: string;
    }
  | {
      readonly ok: false;
      readonly stdout?: string;
      readonly stderr?: string;
      readonly exitCode: number | null;
      readonly timedOut?: boolean;
    };

export type OpencodeRunTurn = (input: OpencodeRunInput) => Promise<OpencodeRunResult>;

export async function runOpencodeCli(input: OpencodeRunInput): Promise<OpencodeRunResult> {
  const command = input.command ?? "opencode";
  const args = [
    command,
    "run",
    "--model",
    input.modelId,
    "--cwd",
    input.cwd,
    "--prompt",
    input.prompt,
  ];
  const env = sanitizeProviderEnvironment(input.environment);
  const proc = Bun.spawn(args, {
    cwd: input.cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timeoutId =
    input.timeoutMs !== undefined
      ? setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, input.timeoutMs)
      : undefined;

  const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
  const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");

  const exitCode = await proc.exited;
  if (timeoutId) clearTimeout(timeoutId);
  const stdout = await stdoutPromise;
  const stderr = await stderrPromise;

  if (exitCode !== 0) {
    return timedOut
      ? { ok: false, exitCode, stdout, stderr, timedOut: true }
      : { ok: false, exitCode, stdout, stderr };
  }

  return {
    ok: true,
    text: stdout,
    ...(stderr.length > 0 && { stderr }),
  };
}

export function sanitizeProviderEnvironment(
  extra: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  delete env.CLAUDECODE;
  if (extra) {
    for (const [key, value] of Object.entries(extra)) env[key] = value;
  }
  return env;
}
