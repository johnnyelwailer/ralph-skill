export type OpencodeRunInput = {
  readonly modelId: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly variant?: string;
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
  const env = sanitizeProviderEnvironment(input.environment);
  const args = [
    command,
    "run",
    "--model",
    input.modelId,
    "--dir",
    input.cwd,
    "--format",
    "json",
    ...(input.variant ? ["--variant", input.variant] : []),
    input.prompt,
  ];
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
    const normalizedStdout = extractErrorMessage(stdout) ?? stdout;
    return timedOut
      ? { ok: false, exitCode, stdout: normalizedStdout, stderr, timedOut: true }
      : { ok: false, exitCode, stdout: normalizedStdout, stderr };
  }

  const sessionId = extractSessionId(stdout);
  if (sessionId) {
    const exported = await exportOpencodeSession({ command, cwd: input.cwd, env, sessionId });
    if (exported) {
      return {
        ok: true,
        text: exported.text,
        ...(exported.usage && { usage: exported.usage }),
        ...(stderr.length > 0 && { stderr }),
      };
    }
  }

  const text = extractLatestText(stdout) ?? stdout;

  return {
    ok: true,
    text,
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

type ExportedUsage = NonNullable<Extract<OpencodeRunResult, { ok: true }>['usage']>;

async function exportOpencodeSession(input: {
  command: string;
  cwd: string;
  env: Record<string, string>;
  sessionId: string;
}): Promise<{ text: string; usage?: ExportedUsage } | null> {
  const proc = Bun.spawn([input.command, "export", input.sessionId], {
    cwd: input.cwd,
    env: input.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
  const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");
  const exitCode = await proc.exited;
  const stdout = await stdoutPromise;
  await stderrPromise;
  if (exitCode !== 0) return null;
  return extractExportedSession(stdout);
}

function parseJsonLines(raw: string): Record<string, unknown>[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" ? [parsed as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
}

function extractSessionId(raw: string): string | null {
  for (const event of parseJsonLines(raw)) {
    if (typeof event.sessionID === "string" && event.sessionID.length > 0) {
      return event.sessionID;
    }
  }
  return null;
}

function extractErrorMessage(raw: string): string | null {
  for (const event of parseJsonLines(raw)) {
    const error = asRecord(event.error);
    const data = asRecord(error?.data);
    if (typeof data?.message === "string" && data.message.length > 0) {
      return data.message;
    }
  }
  return null;
}

function extractLatestText(raw: string): string | null {
  const events = parseJsonLines(raw);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const part = asRecord(events[index]?.part);
    if (part?.type === "text" && typeof part.text === "string") {
      return part.text;
    }
  }
  return null;
}

function extractExportedSession(raw: string): { text: string; usage?: ExportedUsage } | null {
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(jsonStart));
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  const messages = Array.isArray(root?.messages) ? root.messages : [];
  const assistantMessages = messages
    .map(asRecord)
    .filter((message) => asRecord(message?.info)?.role === "assistant");
  if (assistantMessages.length === 0) return null;

  const lastAssistant = assistantMessages.at(-1)!;
  const parts = Array.isArray(lastAssistant.parts) ? lastAssistant.parts : [];
  const text = parts
    .map(asRecord)
    .filter(
      (part): part is Record<string, unknown> & { text: string } =>
        part?.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");

  const info = asRecord(lastAssistant.info);
  const tokens = asRecord(info?.tokens);
  const cache = asRecord(tokens?.cache);
  const usage: ExportedUsage = {
    ...(typeof tokens?.input === "number" && { tokensIn: tokens.input }),
    ...(typeof tokens?.output === "number" && { tokensOut: tokens.output }),
    ...(typeof cache?.read === "number" && { cacheRead: cache.read }),
    ...(typeof info?.cost === "number" && { costUsd: info.cost }),
  };

  return {
    text,
    ...(Object.keys(usage).length > 0 && { usage }),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}