import type {
  ArtifactRegistry,
  ArtifactFilter,
  ArtifactKind,
} from "@aloop/state-sqlite";
import { badRequest, errorResponse, jsonResponse, methodNotAllowed } from "@aloop/daemon-routes";
import {
  saveArtifactFile,
  readArtifactFile,
  deleteArtifactFile,
} from "./artifacts-storage.ts";

export type ArtifactsDeps = {
  readonly registry: ArtifactRegistry;
  readonly artifactsDir: () => string;
};

export async function handleArtifacts(
  req: Request,
  deps: ArtifactsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/artifacts")) return undefined;

  if (pathname === "/v1/artifacts") {
    if (req.method === "GET") return listArtifacts(req, deps);
    if (req.method === "POST") return uploadArtifact(req, deps);
    return methodNotAllowed();
  }

  if (pathname.startsWith("/v1/artifacts/")) {
    const rest = pathname.slice("/v1/artifacts/".length);
    const segments = rest.split("/");
    const id = segments[0]!;

    if (!id) return undefined;

    if (segments.length === 1) {
      if (req.method === "GET") return getArtifact(id, deps);
      if (req.method === "DELETE") return deleteArtifact(id, deps);
      return methodNotAllowed();
    }

    if (segments[1] === "content") {
      if (req.method === "GET") return getArtifactContent(id, deps);
      return methodNotAllowed();
    }

    return methodNotAllowed();
  }

  return undefined;
}

function listArtifacts(req: Request, deps: ArtifactsDeps): Response {
  const url = new URL(req.url);
  const filter: ArtifactFilter = {};

  const projectId = url.searchParams.get("project_id");
  if (projectId) (filter as Record<string, string>).project_id = projectId;

  const sessionId = url.searchParams.get("session_id");
  if (sessionId) (filter as Record<string, string>).session_id = sessionId;

  const setupRunId = url.searchParams.get("setup_run_id");
  if (setupRunId) (filter as Record<string, string>).setup_run_id = setupRunId;

  const workItemKey = url.searchParams.get("work_item_key");
  if (workItemKey) (filter as Record<string, string>).work_item_key = workItemKey;

  const phase = url.searchParams.get("phase");
  if (phase) (filter as Record<string, string>).phase = phase;

  const type = url.searchParams.get("type");
  if (type) (filter as Record<string, string>).type = type;

  const composerTurnId = url.searchParams.get("composer_turn_id");
  if (composerTurnId) (filter as Record<string, string>).composer_turn_id = composerTurnId;

  const controlSubagentRunId = url.searchParams.get("control_subagent_run_id");
  if (controlSubagentRunId) (filter as Record<string, string>).control_subagent_run_id = controlSubagentRunId;

  const incubationItemId = url.searchParams.get("incubation_item_id");
  if (incubationItemId) (filter as Record<string, string>).incubation_item_id = incubationItemId;

  const researchRunId = url.searchParams.get("research_run_id");
  if (researchRunId) (filter as Record<string, string>).research_run_id = researchRunId;

  const artifacts = deps.registry.list(filter);
  return jsonResponse(200, { _v: 1, items: artifacts, next_cursor: null });
}

function getArtifact(id: string, deps: ArtifactsDeps): Response {
  const artifact = deps.registry.get(id);
  if (!artifact) {
    return errorResponse(404, "not_found", `artifact not found: ${id}`, { id });
  }
  return jsonResponse(200, artifact);
}

function getArtifactContent(id: string, deps: ArtifactsDeps): Response {
  const artifact = deps.registry.get(id);
  if (!artifact) {
    return errorResponse(404, "not_found", `artifact not found: ${id}`, { id });
  }

  const content = readArtifactFile(deps.artifactsDir(), id, artifact.filename);
  if (!content) {
    return errorResponse(404, "not_found", `artifact file not found: ${id}`, {
      id,
      filename: artifact.filename,
    });
  }

  return new Response(content, {
    status: 200,
    headers: {
      "content-type": artifact.media_type,
      "content-length": String(artifact.bytes),
    },
  });
}

function deleteArtifact(id: string, deps: ArtifactsDeps): Response {
  const artifact = deps.registry.get(id);
  if (!artifact) {
    return errorResponse(404, "not_found", `artifact not found: ${id}`, { id });
  }
  deleteArtifactFile(deps.artifactsDir(), id, artifact.filename);
  deps.registry.delete(id);
  return new Response(null, { status: 204 });
}

async function uploadArtifact(req: Request, deps: ArtifactsDeps): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData() as FormData;
  } catch {
    return badRequest("invalid multipart/form-data body");
  }

  const projectId = formData.get("project_id");
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    return badRequest("project_id is required");
  }

  const kind = formData.get("kind");
  if (typeof kind !== "string" || kind.trim().length === 0) {
    return badRequest("kind is required");
  }
  const validKinds: ArtifactKind[] = ["image", "screenshot", "mockup", "diff", "other"];
  if (!validKinds.includes(kind as ArtifactKind)) {
    return badRequest(`kind must be one of: ${validKinds.join(", ")}`);
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return badRequest("file field is required and must be a file");
  }

  const filename = (file as File).name ?? "unknown";
  const mediaType = (file as File).type || "application/octet-stream";
  const bytes = (file as File).size;

  const sessionId = formData.get("session_id");
  const sessionIdValue = typeof sessionId === "string" ? sessionId : null;

  const setupRunId = formData.get("setup_run_id");
  const setupRunIdValue = typeof setupRunId === "string" ? setupRunId : null;

  const workItemKey = formData.get("work_item_key");
  const workItemKeyValue = typeof workItemKey === "string" ? workItemKey : null;

  const label = formData.get("label");
  const labelValue = typeof label === "string" ? label : null;

  const phase = formData.get("phase");
  const phaseValue = typeof phase === "string" ? phase : null;

  const composerTurnId = formData.get("composer_turn_id");
  const composerTurnIdValue = typeof composerTurnId === "string" ? composerTurnId : null;

  const controlSubagentRunId = formData.get("control_subagent_run_id");
  const controlSubagentRunIdValue = typeof controlSubagentRunId === "string" ? controlSubagentRunId : null;

  const incubationItemId = formData.get("incubation_item_id");
  const incubationItemIdValue = typeof incubationItemId === "string" ? incubationItemId : null;

  const researchRunId = formData.get("research_run_id");
  const researchRunIdValue = typeof researchRunId === "string" ? researchRunId : null;

  const artifact = deps.registry.create({
    project_id: projectId.trim(),
    session_id: sessionIdValue?.trim() ?? null,
    setup_run_id: setupRunIdValue?.trim() ?? null,
    work_item_key: workItemKeyValue?.trim() ?? null,
    kind: kind as ArtifactKind,
    phase: phaseValue?.trim() ?? null,
    label: labelValue?.trim() ?? null,
    filename,
    media_type: mediaType,
    bytes,
    composer_turn_id: composerTurnIdValue?.trim() ?? null,
    control_subagent_run_id: controlSubagentRunIdValue?.trim() ?? null,
    incubation_item_id: incubationItemIdValue?.trim() ?? null,
    research_run_id: researchRunIdValue?.trim() ?? null,
  });

  const arrayBuffer = await file.arrayBuffer();
  saveArtifactFile(deps.artifactsDir(), artifact.id, filename, new Uint8Array(arrayBuffer));

  return jsonResponse(201, artifact);
}
