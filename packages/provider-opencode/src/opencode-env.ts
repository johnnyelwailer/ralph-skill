import type { ReasoningEffort } from "@aloop/provider";

export function sanitizeProviderEnvironment(extra: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  delete env.CLAUDECODE;
  if (extra) {
    for (const [key, value] of Object.entries(extra)) env[key] = value;
  }
  return env;
}

export function buildRuntimeEnvironment(input: {
  sessionId: string;
  authHandle: string;
  cwd: string;
  environment?: Readonly<Record<string, string>>;
}): Record<string, string> {
  return sanitizeProviderEnvironment({
    ...input.environment,
    AUTH_HANDLE: input.authHandle,
    ALOOP_SESSION_ID: input.sessionId,
    ALOOP_PROJECT_PATH: input.cwd,
    ALOOP_WORKTREE: input.cwd,
  });
}

export async function withTemporaryEnvironment<T>(
  setValues: Readonly<Record<string, string>>,
  removeKeys: readonly string[],
  fn: () => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();
  for (const key of new Set([...Object.keys(setValues), ...removeKeys])) previousValues.set(key, process.env[key]);
  for (const [key, value] of Object.entries(setValues)) process.env[key] = value;
  for (const key of removeKeys) delete process.env[key];
  try {
    return await fn();
  } finally {
    for (const [key, value] of previousValues) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
}

export function resolveVariant(reasoningEffort: ReasoningEffort | undefined): string | undefined {
  switch (reasoningEffort) {
    case undefined:
    case "none":
      return undefined;
    case "xhigh":
      return "max";
    default:
      return reasoningEffort;
  }
}