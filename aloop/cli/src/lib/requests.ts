import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeQueueOverride } from './plan.js';
import { writeSpecBackfill } from './specBackfill.js';

export type RequestType =
  | 'create_issues'
  | 'update_issue'
  | 'close_issue'
  | 'create_pr'
  | 'merge_pr'
  | 'dispatch_child'
  | 'steer_child'
  | 'stop_child'
  | 'post_comment'
  | 'query_issues'
  | 'spec_backfill';

export interface BaseRequest {
  id: string;
  type: RequestType;
}

export interface CreateIssuesRequest extends BaseRequest {
  type: 'create_issues';
  payload: {
    issues: Array<{
      title: string;
      body_file: string;
      labels?: string[];
      parent?: number;
    }>;
  };
}

export interface UpdateIssueRequest extends BaseRequest {
  type: 'update_issue';
  payload: {
    number: number;
    body_file?: string;
    labels_add?: string[];
    labels_remove?: string[];
    state?: 'open' | 'closed';
  };
}

export interface CloseIssueRequest extends BaseRequest {
  type: 'close_issue';
  payload: {
    number: number;
    reason: string;
  };
}

export interface CreatePrRequest extends BaseRequest {
  type: 'create_pr';
  payload: {
    head: string;
    base: string;
    title: string;
    body_file: string;
    issue_number: number;
  };
}

export interface MergePrRequest extends BaseRequest {
  type: 'merge_pr';
  payload: {
    number: number;
    strategy: 'squash' | 'merge' | 'rebase';
  };
}

export interface DispatchChildRequest extends BaseRequest {
  type: 'dispatch_child';
  payload: {
    issue_number: number;
    branch: string;
    pipeline: string;
    sub_spec_file: string;
  };
}

export interface SteerChildRequest extends BaseRequest {
  type: 'steer_child';
  payload: {
    issue_number: number;
    prompt_file: string;
  };
}

export interface StopChildRequest extends BaseRequest {
  type: 'stop_child';
  payload: {
    issue_number: number;
    reason: string;
  };
}

export interface PostCommentRequest extends BaseRequest {
  type: 'post_comment';
  payload: {
    issue_number: number;
    body_file: string;
  };
}

export interface QueryIssuesRequest extends BaseRequest {
  type: 'query_issues';
  payload: {
    labels?: string[];
    state?: 'open' | 'closed' | 'all';
  };
}

export interface SpecBackfillRequest extends BaseRequest {
  type: 'spec_backfill';
  payload: {
    file: string;
    section: string;
    content_file: string;
  };
}

export type AgentRequest =
  | CreateIssuesRequest
  | UpdateIssueRequest
  | CloseIssueRequest
  | CreatePrRequest
  | MergePrRequest
  | DispatchChildRequest
  | SteerChildRequest
  | StopChildRequest
  | PostCommentRequest
  | QueryIssuesRequest
  | SpecBackfillRequest;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const VALID_REQUEST_TYPES = new Set<string>([
  'create_issues', 'update_issue', 'close_issue', 'create_pr', 'merge_pr',
  'dispatch_child', 'steer_child', 'stop_child', 'post_comment', 'query_issues', 'spec_backfill',
]);

const VALID_MERGE_STRATEGIES = new Set(['squash', 'merge', 'rebase']);

export function validateRequest(raw: unknown): AgentRequest {
  if (typeof raw !== 'object' || raw === null) {
    throw new ValidationError('Request must be a non-null object');
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError('Request must have a non-empty string "id"');
  }
  if (typeof obj.type !== 'string' || !VALID_REQUEST_TYPES.has(obj.type)) {
    throw new ValidationError(`Invalid request type: ${JSON.stringify(obj.type)}`);
  }
  if (typeof obj.payload !== 'object' || obj.payload === null) {
    throw new ValidationError('Request must have a non-null "payload" object');
  }

  const p = obj.payload as Record<string, unknown>;

  switch (obj.type) {
    case 'create_issues': {
      if (!Array.isArray(p.issues) || p.issues.length === 0) {
        throw new ValidationError('create_issues: payload.issues must be a non-empty array');
      }
      for (let i = 0; i < p.issues.length; i++) {
        const issue = p.issues[i] as Record<string, unknown>;
        if (typeof issue.title !== 'string' || issue.title.length === 0)
          throw new ValidationError(`create_issues: issues[${i}].title must be a non-empty string`);
        if (typeof issue.body_file !== 'string' || issue.body_file.length === 0)
          throw new ValidationError(`create_issues: issues[${i}].body_file must be a non-empty string`);
      }
      break;
    }
    case 'update_issue': {
      if (typeof p.number !== 'number' || !Number.isInteger(p.number) || p.number <= 0)
        throw new ValidationError('update_issue: payload.number must be a positive integer');
      break;
    }
    case 'close_issue': {
      if (typeof p.number !== 'number' || !Number.isInteger(p.number) || p.number <= 0)
        throw new ValidationError('close_issue: payload.number must be a positive integer');
      if (typeof p.reason !== 'string' || p.reason.length === 0)
        throw new ValidationError('close_issue: payload.reason must be a non-empty string');
      break;
    }
    case 'create_pr': {
      if (typeof p.head !== 'string' || p.head.length === 0)
        throw new ValidationError('create_pr: payload.head must be a non-empty string');
      if (typeof p.base !== 'string' || p.base.length === 0)
        throw new ValidationError('create_pr: payload.base must be a non-empty string');
      if (typeof p.title !== 'string' || p.title.length === 0)
        throw new ValidationError('create_pr: payload.title must be a non-empty string');
      if (typeof p.body_file !== 'string' || p.body_file.length === 0)
        throw new ValidationError('create_pr: payload.body_file must be a non-empty string');
      if (typeof p.issue_number !== 'number' || !Number.isInteger(p.issue_number) || p.issue_number <= 0)
        throw new ValidationError('create_pr: payload.issue_number must be a positive integer');
      break;
    }
    case 'merge_pr': {
      if (typeof p.number !== 'number' || !Number.isInteger(p.number) || p.number <= 0)
        throw new ValidationError('merge_pr: payload.number must be a positive integer');
      if (typeof p.strategy !== 'string' || !VALID_MERGE_STRATEGIES.has(p.strategy))
        throw new ValidationError('merge_pr: payload.strategy must be one of: squash, merge, rebase');
      break;
    }
    case 'dispatch_child': {
      if (typeof p.issue_number !== 'number' || !Number.isInteger(p.issue_number) || p.issue_number <= 0)
        throw new ValidationError('dispatch_child: payload.issue_number must be a positive integer');
      if (typeof p.branch !== 'string' || p.branch.length === 0)
        throw new ValidationError('dispatch_child: payload.branch must be a non-empty string');
      if (typeof p.pipeline !== 'string' || p.pipeline.length === 0)
        throw new ValidationError('dispatch_child: payload.pipeline must be a non-empty string');
      if (typeof p.sub_spec_file !== 'string' || p.sub_spec_file.length === 0)
        throw new ValidationError('dispatch_child: payload.sub_spec_file must be a non-empty string');
      break;
    }
    case 'steer_child': {
      if (typeof p.issue_number !== 'number' || !Number.isInteger(p.issue_number) || p.issue_number <= 0)
        throw new ValidationError('steer_child: payload.issue_number must be a positive integer');
      if (typeof p.prompt_file !== 'string' || p.prompt_file.length === 0)
        throw new ValidationError('steer_child: payload.prompt_file must be a non-empty string');
      break;
    }
    case 'stop_child': {
      if (typeof p.issue_number !== 'number' || !Number.isInteger(p.issue_number) || p.issue_number <= 0)
        throw new ValidationError('stop_child: payload.issue_number must be a positive integer');
      if (typeof p.reason !== 'string' || p.reason.length === 0)
        throw new ValidationError('stop_child: payload.reason must be a non-empty string');
      break;
    }
    case 'post_comment': {
      if (typeof p.issue_number !== 'number' || !Number.isInteger(p.issue_number) || p.issue_number <= 0)
        throw new ValidationError('post_comment: payload.issue_number must be a positive integer');
      if (typeof p.body_file !== 'string' || p.body_file.length === 0)
        throw new ValidationError('post_comment: payload.body_file must be a non-empty string');
      break;
    }
    case 'query_issues': {
      // All fields optional — no required field validation
      break;
    }
    case 'spec_backfill': {
      if (typeof p.file !== 'string' || p.file.length === 0)
        throw new ValidationError('spec_backfill: payload.file must be a non-empty string');
      if (typeof p.section !== 'string' || p.section.length === 0)
        throw new ValidationError('spec_backfill: payload.section must be a non-empty string');
      if (typeof p.content_file !== 'string' || p.content_file.length === 0)
        throw new ValidationError('spec_backfill: payload.content_file must be a non-empty string');
      break;
    }
  }

  return raw as AgentRequest;
}

export interface RequestProcessorOptions {
  workdir: string;
  sessionId: string;
  aloopDir: string;
  sessionDir: string;
  logPath: string;
  ghCommandRunner: (operation: string, sessionId: string, requestPath: string) => Promise<{ exitCode: number; output: string }>;
  spawnSync?: typeof spawnSync;
}

export async function processAgentRequests(options: RequestProcessorOptions): Promise<void> {
  const requestsDir = path.join(options.aloopDir, 'requests');
  if (!existsSync(requestsDir)) return;
  const processedIdsPath = path.join(requestsDir, 'processed-ids.json');
  const processedIds = await loadProcessedRequestIds(processedIdsPath);

  const entries = await fs.readdir(requestsDir, { withFileTypes: true });
  const requestFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json') && e.name.toLowerCase() !== 'processed-ids.json')
    .map((e) => e.name)
    .sort();

  if (requestFiles.length === 0) return;

  const processedDir = path.join(requestsDir, 'processed');
  const failedDir = path.join(requestsDir, 'failed');
  await fs.mkdir(processedDir, { recursive: true });
  await fs.mkdir(failedDir, { recursive: true });

  const processedEntries = await fs.readdir(processedDir);
  const reservedArchivePaths = new Set(processedEntries.map(e => path.join(processedDir, e).toLowerCase()));

  for (const fileName of requestFiles) {
    const requestPath = path.join(requestsDir, fileName);
    let request: AgentRequest;
    try {
      const content = await fs.readFile(requestPath, 'utf8');
      const parsed = JSON.parse(content);
      request = validateRequest(parsed);
    } catch (e) {
      const isValidation = e instanceof ValidationError;
      const archivePath = getArchivePath(failedDir, fileName, new Set());
      await fs.rename(requestPath, archivePath);
      await writeSessionLogEntry(options.logPath, 'gh_request_failed', {
        type: 'unknown',
        id: 'unknown',
        request_file: fileName,
        error: isValidation
          ? `Validation failed: ${e.message}`
          : `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
      });
      continue;
    }

    if (processedIds.has(request.id)) {
      const archivePath = getArchivePath(processedDir, fileName, reservedArchivePaths);
      await fs.rename(requestPath, archivePath);
      await writeSessionLogEntry(options.logPath, 'gh_request_skipped_duplicate', {
        type: request.type,
        id: request.id,
        request_file: fileName,
      });
      continue;
    }

    try {
      await handleRequest(request, fileName, options);
      processedIds.add(request.id);
      await saveProcessedRequestIds(processedIdsPath, processedIds);
      const archivePath = getArchivePath(processedDir, fileName, reservedArchivePaths);
      await fs.rename(requestPath, archivePath);
      await writeSessionLogEntry(options.logPath, 'gh_request_processed', {
        type: request.type,
        id: request.id,
        request_file: fileName
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const archivePath = getArchivePath(failedDir, fileName, new Set());
      await fs.rename(requestPath, archivePath);
      await writeFailureToQueue(request, errorMsg, options, fileName);
      await writeSessionLogEntry(options.logPath, 'gh_request_failed', {
        type: request.type,
        id: request.id,
        request_file: fileName,
        error: errorMsg
      });
    }
  }
}

async function loadProcessedRequestIds(filePath: string): Promise<Set<string>> {
  if (!existsSync(filePath)) return new Set();

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

async function saveProcessedRequestIds(filePath: string, ids: Set<string>): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify([...ids].sort(), null, 2), 'utf8');
}

function getArchivePath(processedDir: string, fileName: string, existingFiles: Set<string>): string {
  let destination = path.join(processedDir, fileName);
  if (!existingFiles.has(destination.toLowerCase())) {
    existingFiles.add(destination.toLowerCase());
    return destination;
  }

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let suffix = 1;
  while (true) {
    const candidate = path.join(processedDir, `${base}.dup${suffix}${ext}`);
    if (!existingFiles.has(candidate.toLowerCase())) {
      existingFiles.add(candidate.toLowerCase());
      return candidate;
    }
    suffix += 1;
  }
}

async function writeSessionLogEntry(logPath: string, event: string, data: Record<string, unknown>): Promise<void> {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function handleRequest(request: AgentRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  switch (request.type) {
    case 'create_issues':
      return handleCreateIssues(request, fileName, options);
    case 'update_issue':
      return handleUpdateIssue(request, fileName, options);
    case 'close_issue':
      return handleCloseIssue(request, fileName, options);
    case 'create_pr':
      return handleCreatePr(request, fileName, options);
    case 'merge_pr':
      return handleMergePr(request, fileName, options);
    case 'dispatch_child':
      return handleDispatchChild(request, fileName, options);
    case 'steer_child':
      return handleSteerChild(request, fileName, options);
    case 'stop_child':
      return handleStopChild(request, fileName, options);
    case 'post_comment':
      return handlePostComment(request, fileName, options);
    case 'query_issues':
      return handleQueryIssues(request, fileName, options);
    case 'spec_backfill':
      return handleSpecBackfill(request, fileName, options);
    default:
      throw new Error(`Unsupported request type: ${(request as any).type}`);
  }
}

async function handleCreateIssues(request: CreateIssuesRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const existingIssueTitles = await loadOrchestratorIssueTitles(options.sessionDir);
  // Map to gh.ts 'issue-create'
  // Since 'create_issues' can have multiple issues, we might need to loop or use a specialized subcommand
  // For now, let's assume one by one if not supported as batch
  const results = [];
  const skippedTitles: string[] = [];
  for (const issueReq of request.payload.issues) {
    const normalizedTitle = normalizeIssueTitle(issueReq.title);
    if (existingIssueTitles.has(normalizedTitle)) {
      skippedTitles.push(issueReq.title);
      await writeSessionLogEntry(options.logPath, 'gh_request_skipped_existing_issue_title', {
        type: request.type,
        id: request.id,
        issue_title: issueReq.title,
        reason: 'duplicate_issue_title_in_orchestrator_state',
      });
      continue;
    }

    // We need to pass the body content, but gh.ts issue-create expects a request file
    // So we create temporary request files for each issue if needed, 
    // or we modify gh.ts to handle 'create_issues' payload directly.
    // For simplicity, let's just use the current ghCommandRunner with a temporary file if needed.
    const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}_${results.length}.json`);
    await fs.writeFile(tempRequestPath, JSON.stringify({
      type: 'issue-create',
      title: issueReq.title,
      body: await fs.readFile(path.join(options.workdir, issueReq.body_file), 'utf8'),
      labels: [...(issueReq.labels || []), 'aloop']
    }));
    
    const result = await options.ghCommandRunner('issue-create', options.sessionId, tempRequestPath);
    await fs.unlink(tempRequestPath);
    
    if (result.exitCode !== 0) {
      throw new Error(`issue-create failed: ${result.output}`);
    }
    results.push(JSON.parse(result.output));
    existingIssueTitles.add(normalizedTitle);
  }

  await writeSuccessToQueue(request, { issues: results, skipped_titles: skippedTitles }, options, fileName);
}

function normalizeIssueTitle(title: string): string {
  return title.trim().toLowerCase();
}

async function loadOrchestratorIssueTitles(sessionDir: string): Promise<Set<string>> {
  const statePath = path.join(sessionDir, 'orchestrator.json');
  if (!existsSync(statePath)) return new Set();

  const raw = await fs.readFile(statePath, 'utf8');
  const parsed = JSON.parse(raw) as { issues?: Array<{ title?: unknown }> };
  if (!Array.isArray(parsed.issues)) {
    throw new Error(`Invalid orchestrator state: expected "issues" array in ${statePath}`);
  }

  const titles = new Set<string>();
  for (const issue of parsed.issues) {
    if (typeof issue?.title !== 'string') continue;
    const normalized = normalizeIssueTitle(issue.title);
    if (normalized.length === 0) continue;
    titles.add(normalized);
  }
  return titles;
}

async function handleUpdateIssue(request: UpdateIssueRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const args = ['issue', 'edit', String(request.payload.number)];
  if (request.payload.body_file) {
    const body = await fs.readFile(path.join(options.workdir, request.payload.body_file), 'utf8');
    const tempBodyPath = path.join(options.aloopDir, 'requests', `_tmp_body_${request.id}.md`);
    await fs.writeFile(tempBodyPath, body);
    args.push('--body-file', tempBodyPath);
    const spawn = options.spawnSync || spawnSync;
    try {
      const result = spawn('gh', args, { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    } finally {
      await fs.unlink(tempBodyPath);
    }
  } else {
    if (request.payload.state) args.push('--state', request.payload.state);
    if (request.payload.labels_add) {
      for (const l of request.payload.labels_add) args.push('--add-label', l);
    }
    if (request.payload.labels_remove) {
      for (const l of request.payload.labels_remove) args.push('--remove-label', l);
    }
    const spawn = options.spawnSync || spawnSync;
    const result = spawn('gh', args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }

  await writeSuccessToQueue(request, { status: 'updated' }, options, fileName);
}

async function handleCloseIssue(request: CloseIssueRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'issue-close',
    issue_number: request.payload.number,
    target_labels: ['aloop'] // Policy check requires this
  }));
  const result = await options.ghCommandRunner('issue-close', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, { status: 'closed' }, options, fileName);
}

async function handleCreatePr(request: CreatePrRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const existingPr = findExistingPrForHeadBase(request.payload.head, request.payload.base, options);
  if (existingPr) {
    await writeSessionLogEntry(options.logPath, 'gh_request_skipped_existing_pr', {
      type: request.type,
      id: request.id,
      head: request.payload.head,
      base: request.payload.base,
      existing_pr_number: existingPr.number,
      existing_pr_url: existingPr.url,
    });
    await writeSuccessToQueue(request, {
      status: 'skipped',
      reason: 'duplicate_pr_head_base',
      existing_pr: existingPr,
    }, options, fileName);
    return;
  }

  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'pr-create',
    head: request.payload.head,
    base: request.payload.base || 'agent/trunk',
    title: request.payload.title,
    body: await fs.readFile(path.join(options.workdir, request.payload.body_file), 'utf8')
  }));
  const result = await options.ghCommandRunner('pr-create', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, JSON.parse(result.output), options, fileName);
}

function findExistingPrForHeadBase(
  head: string,
  base: string,
  options: RequestProcessorOptions
): { number: number; url?: string } | null {
  const spawn = options.spawnSync || spawnSync;
  const result = spawn(
    'gh',
    ['pr', 'list', '--head', head, '--base', base, '--state', 'all', '--json', 'number,url', '--limit', '100'],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const [first] = parsed as Array<{ number?: unknown; url?: unknown }>;
  if (typeof first.number !== 'number' || !Number.isInteger(first.number) || first.number <= 0) {
    return null;
  }
  return {
    number: first.number,
    url: typeof first.url === 'string' ? first.url : undefined,
  };
}

async function handleMergePr(request: MergePrRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  // Check if PR is already merged before attempting merge
  const spawn = options.spawnSync || spawnSync;
  const viewResult = spawn(
    'gh',
    ['pr', 'view', String(request.payload.number), '--json', 'state'],
    { encoding: 'utf8' }
  );
  if (viewResult.status === 0) {
    try {
      const prData = JSON.parse(viewResult.stdout) as { state?: string };
      if (prData.state === 'MERGED') {
        await writeSessionLogEntry(options.logPath, 'gh_request_skipped_already_merged', {
          type: request.type,
          id: request.id,
          pr_number: request.payload.number,
        });
        await writeSuccessToQueue(request, {
          status: 'skipped',
          reason: 'already_merged',
          pr_number: request.payload.number,
        }, options, fileName);
        return;
      }
    } catch { /* parse failure — proceed with merge attempt */ }
  }

  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'pr-merge',
    pr_number: request.payload.number,
    strategy: request.payload.strategy
  }));
  const result = await options.ghCommandRunner('pr-merge', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, { status: 'merged' }, options, fileName);
}

async function handleDispatchChild(request: DispatchChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    issue_number: request.payload.issue_number,
    branch: request.payload.branch,
    pipeline: request.payload.pipeline,
    sub_spec_file: request.payload.sub_spec_file,
  }));
  const result = await options.ghCommandRunner('dispatch-child', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(`Failed to dispatch child: ${result.output}`);
  const output = result.output ? JSON.parse(result.output) : { status: 'dispatched' };
  await writeSuccessToQueue(request, output, options, fileName);
}

async function handleSteerChild(request: SteerChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  // Find child session for issue_number in active sessions
  const activePath = path.join(options.aloopDir, 'active.json');
  if (!existsSync(activePath)) throw new Error('No active sessions found');
  
  const activeContent = await fs.readFile(activePath, 'utf8');
  const active = JSON.parse(activeContent);
  let childSessionId: string | null = null;
  for (const [id, _session] of Object.entries(active as any)) {
    // Check meta.json in each session to find the issue_number
    const sessionMetaPath = path.join(options.aloopDir, 'sessions', id, 'meta.json');
    if (existsSync(sessionMetaPath)) {
      const meta = JSON.parse(await fs.readFile(sessionMetaPath, 'utf8'));
      if (meta.issue_number === request.payload.issue_number || meta.gh_issue_number === request.payload.issue_number) {
        childSessionId = id;
        break;
      }
    }
  }

  if (!childSessionId) {
    // Try history.json if not in active
    const historyPath = path.join(options.aloopDir, 'history.json');
    if (existsSync(historyPath)) {
      const historyContent = await fs.readFile(historyPath, 'utf8');
      const history = JSON.parse(historyContent);
      if (Array.isArray(history)) {
        for (const session of history) {
          if (session.issue_number === request.payload.issue_number) {
            childSessionId = session.session_id;
            break;
          }
        }
      }
    }
  }

  if (!childSessionId) throw new Error(`Could not find child session for issue #${request.payload.issue_number}`);

  const childSessionDir = path.join(options.aloopDir, 'sessions', childSessionId);
  const steerContent = await fs.readFile(path.join(options.workdir, request.payload.prompt_file), 'utf8');
  
  await writeQueueOverride(childSessionDir, 'steer', steerContent, {
    agent: 'steer',
    type: 'remote_steering_override',
    request_id: request.id
  });

  await writeSuccessToQueue(request, { status: 'steered', session_id: childSessionId }, options, fileName);
}

async function handleStopChild(request: StopChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const args = [
    'gh', 'stop',
    '--issue', String(request.payload.issue_number),
    '--home-dir', path.dirname(options.aloopDir),
    '--output', 'json'
  ];
  const spawn = options.spawnSync || spawnSync;
  const result = spawn('aloop', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to stop child: ${result.stderr || result.stdout}`);
  }
  await writeSuccessToQueue(request, { status: 'stopped' }, options, fileName);
}

async function handlePostComment(request: PostCommentRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const requestIdMarker = `<!-- aloop-request-id: ${request.id} -->`;
  const existingCommentBodies = getIssueCommentBodies(request.payload.issue_number, options);
  if (existingCommentBodies.some((commentBody) => commentBody.includes(requestIdMarker))) {
    await writeSessionLogEntry(options.logPath, 'gh_request_skipped_duplicate_comment', {
      type: request.type,
      id: request.id,
      issue_number: request.payload.issue_number,
      reason: 'duplicate_request_id_marker_found',
    });
    await writeSuccessToQueue(request, {
      status: 'skipped',
      reason: 'duplicate_comment_marker',
      issue_number: request.payload.issue_number,
    }, options, fileName);
    return;
  }

  const body = await fs.readFile(path.join(options.workdir, request.payload.body_file), 'utf8');
  const bodyWithRequestId = body.includes(requestIdMarker)
    ? body
    : `${body.replace(/\s*$/, '')}\n\n${requestIdMarker}`;
  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'issue-comment',
    issue_number: request.payload.issue_number,
    body: bodyWithRequestId
  }));
  const result = await options.ghCommandRunner('issue-comment', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, { status: 'posted' }, options, fileName);
}

function getIssueCommentBodies(issueNumber: number, options: RequestProcessorOptions): string[] {
  const spawn = options.spawnSync || spawnSync;
  const result = spawn(
    'gh',
    ['api', `repos/{owner}/{repo}/issues/${issueNumber}/comments?per_page=100`],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const commentBodies: string[] = [];
    for (const comment of parsed) {
      if (typeof comment !== 'object' || comment === null) {
        continue;
      }
      const body = (comment as { body?: unknown }).body;
      if (typeof body === 'string') {
        commentBodies.push(body);
      }
    }
    return commentBodies;
  } catch {
    return [];
  }
}

async function handleQueryIssues(request: QueryIssuesRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  // Use 'gh issue list'
  const args = ['issue', 'list', '--json', 'number,title,state,labels', '--limit', '100'];
  if (request.payload.labels) {
    for (const l of request.payload.labels) args.push('--label', l);
  }
  if (request.payload.state) args.push('--state', request.payload.state);
  
  const spawn = options.spawnSync || spawnSync;
  const result = spawn('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  
  await writeSuccessToQueue(request, { issues: JSON.parse(result.stdout) }, options, fileName);
}

async function handleSpecBackfill(request: SpecBackfillRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const content = await fs.readFile(path.join(options.workdir, request.payload.content_file), 'utf8');

  // Read iteration from session status.json (default 0 if unavailable)
  let iteration = 0;
  try {
    const statusRaw = await fs.readFile(path.join(options.sessionDir, 'status.json'), 'utf8');
    const status = JSON.parse(statusRaw);
    if (typeof status.iteration === 'number') iteration = status.iteration;
  } catch { /* status.json may not exist yet */ }

  // Wrap sync spawnSync as async execGit for provenance support
  const spawn = options.spawnSync || spawnSync;
  const execGit = async (args: string[], cwd?: string) => {
    const result = spawn('git', cwd ? ['-C', cwd, ...args] : args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || 'git failed');
    return { stdout: result.stdout || '', stderr: result.stderr || '' };
  };

  await writeSpecBackfill({
    specFile: request.payload.file,
    section: request.payload.section,
    content,
    sessionId: options.sessionId,
    iteration,
    projectRoot: options.workdir,
    deps: { readFile: (p, enc) => fs.readFile(p, enc), writeFile: (p, d, enc) => fs.writeFile(p, d, enc), execGit },
  });

  await writeSuccessToQueue(request, { status: 'backfilled', file: request.payload.file }, options, fileName);
}

async function writeSuccessToQueue(request: AgentRequest, payload: any, options: RequestProcessorOptions, sourceFileName: string): Promise<void> {
  const queueDir = path.join(options.sessionDir, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  
  const timestamp = new Date().toISOString();
  const baseName = path.basename(sourceFileName, path.extname(sourceFileName));
  const fileName = `${baseName}-${new Date().getTime()}-${request.type}-${request.id}.md`;
  const queuePath = path.join(queueDir, fileName);
  
  const frontmatter = {
    type: 'queue_override',
    request_id: request.id,
    request_type: request.type,
    status: 'success',
    payload,
    timestamp
  };
  
  const content = [
    '---',
    JSON.stringify(frontmatter, null, 2),
    '---',
    '',
    `Request \`${request.id}\` (${request.type}) completed successfully at ${timestamp}.`,
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```'
  ].join('\n');
  
  await fs.writeFile(queuePath, content, 'utf8');
}

async function writeFailureToQueue(request: AgentRequest, error: string, options: RequestProcessorOptions, sourceFileName: string): Promise<void> {
  const queueDir = path.join(options.sessionDir, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  
  const timestamp = new Date().toISOString();
  const baseName = path.basename(sourceFileName, path.extname(sourceFileName));
  const fileName = `${baseName}-failed-${new Date().getTime()}-${request.type}-${request.id}.md`;
  const queuePath = path.join(queueDir, fileName);
  
  const frontmatter = {
    type: 'queue_override',
    request_id: request.id,
    request_type: request.type,
    status: 'error',
    error,
    timestamp
  };
  
  const content = [
    '---',
    JSON.stringify(frontmatter, null, 2),
    '---',
    '',
    `Request \`${request.id}\` (${request.type}) failed at ${timestamp}.`,
    '',
    `**Error:** ${error}`,
  ].join('\n');
  
  await fs.writeFile(queuePath, content, 'utf8');
}
