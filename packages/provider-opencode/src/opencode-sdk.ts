import { createServer } from "node:net";
import { createOpencodeClient, createOpencodeServer, type Session } from "@opencode-ai/sdk/v2";
import { buildRuntimeEnvironment, resolveVariant, withTemporaryEnvironment } from "./opencode-env.ts";
import { extractErrorMessage } from "./opencode-errors.ts";
import { toSdkPromptParts, type OpencodeSdkPromptPart } from "./opencode-input-parts.ts";
import { toSdkModel } from "./opencode-model.ts";
import type { OpencodeClientFactory, OpencodePromptResult, OpencodeSessionHandle } from "./opencode-types.ts";

type SdkSessionClient = {
  readonly session: {
    list(options?: { signal?: AbortSignal }): Promise<{ data?: Session[]; error?: unknown }>;
    create(options?: { body?: { title?: string; parentID?: string }; signal?: AbortSignal }): Promise<{ data?: Session; error?: unknown }>;
    prompt(options: {
      sessionID: string;
      directory?: string;
      model?: { providerID: string; modelID: string };
      variant?: string;
      parts?: OpencodeSdkPromptPart[];
      signal?: AbortSignal;
    }): Promise<OpencodePromptResult>;
  };
};

type CachedServerContext = { readonly client: SdkSessionClient; readonly close: () => void; sessionIdPromise?: Promise<string> };

const cachedServers = new Map<string, Promise<CachedServerContext>>();
let startupQueue = Promise.resolve();

export const __sdkTestHooks = { addCachedServerForTest, cachedServerCount, resetCachedServers };

export const getDefaultSessionHandle: OpencodeClientFactory = async (input) => {
  const context = await getOrCreateServerContext(buildServerKey(input), input);
  const getSessionId = async (signal?: AbortSignal) => {
    if (!context.sessionIdPromise) {
      context.sessionIdPromise = ensureSession(context.client, input.sessionId, signal).catch((error) => (delete context.sessionIdPromise, Promise.reject(error)));
    }
    return context.sessionIdPromise;
  };
  return {
    getSessionId,
    async prompt(request): Promise<OpencodePromptResult> {
      const variant = resolveVariant(request.reasoningEffort);
      return context.client.session.prompt({
        sessionID: await getSessionId(request.signal),
        directory: request.cwd,
        model: toSdkModel(request.resolvedModel),
        ...(variant && { variant }),
        parts: toSdkPromptParts(request.promptParts ?? [{ type: "text", text: request.prompt }]),
        ...(request.signal && { signal: request.signal }),
      });
    },
  } satisfies OpencodeSessionHandle;
};

async function getOrCreateServerContext(key: string, input: Parameters<OpencodeClientFactory>[0]): Promise<CachedServerContext> {
  const existing = cachedServers.get(key);
  if (existing) return existing;
  const created = createServerContext(input).catch((error) => (cachedServers.delete(key), Promise.reject(error)));
  cachedServers.set(key, created);
  return created;
}

async function createServerContext(input: Parameters<OpencodeClientFactory>[0]): Promise<CachedServerContext> {
  const environment = buildRuntimeEnvironment(input);
  return runStartupExclusive(async () => withTemporaryEnvironment(environment, ["CLAUDECODE"], async () => {
    const server = await createOpencodeServer({ hostname: "127.0.0.1", port: await reservePort(), timeout: input.timeoutMs ?? 5_000 });
    return { client: createOpencodeClient({ baseUrl: server.url, directory: input.cwd }) as unknown as SdkSessionClient, close: server.close };
  }));
}

async function ensureSession(client: SdkSessionClient, sessionTitle: string, signal?: AbortSignal): Promise<string> {
  const listed = await client.session.list({ ...(signal && { signal }) });
  if (listed.error) throw new Error(extractErrorMessage(listed.error));
  const existing = listed.data?.find((session) => session.title === sessionTitle);
  if (existing) return existing.id;
  const created = await client.session.create({ body: { title: sessionTitle }, ...(signal && { signal }) });
  if (created.error) throw new Error(extractErrorMessage(created.error));
  if (!created.data) throw new Error(`opencode failed to create session: ${sessionTitle}`);
  return created.data.id;
}

function buildServerKey(input: Parameters<OpencodeClientFactory>[0]): string {
  const serialized = Object.entries(buildRuntimeEnvironment(input)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  return `${input.cwd}\n${input.sessionId}\n${serialized}`;
}

async function runStartupExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const previous = startupQueue;
  let release: (() => void) | undefined;
  startupQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

async function reservePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return server.close(() => reject(new Error("failed to allocate port for opencode server")));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function addCachedServerForTest(key: string, close: () => void): void {
  cachedServers.set(key, Promise.resolve({
    client: { session: { list: async () => ({ data: [] }), create: async () => ({ error: { data: { message: "unused" } } }), prompt: async () => ({ error: { data: { message: "unused" } } }) } },
    close,
  }));
}

function cachedServerCount(): number {
  return cachedServers.size;
}

async function resetCachedServers(): Promise<void> {
  const servers = [...cachedServers.values()];
  cachedServers.clear();
  await Promise.all(servers.map(async (serverPromise) => {
    try {
      (await serverPromise).close();
    } catch {}
  }));
}