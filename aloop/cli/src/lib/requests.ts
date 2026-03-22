import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

  const entries = await fs.readdir(requestsDir, { withFileTypes: true });
  const requestFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
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
      request = JSON.parse(content) as AgentRequest;
    } catch (e) {
      const archivePath = getArchivePath(failedDir, fileName, new Set());
      await fs.rename(requestPath, archivePath);
      await writeSessionLogEntry(options.logPath, 'gh_request_failed', {
        type: 'unknown',
        id: 'unknown',
        request_file: fileName,
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
      });
      continue;
    }

    try {
      await handleRequest(request, fileName, options);
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
  // Map to gh.ts 'issue-create'
  // Since 'create_issues' can have multiple issues, we might need to loop or use a specialized subcommand
  // For now, let's assume one by one if not supported as batch
  const results = [];
  for (const issueReq of request.payload.issues) {
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
  }

  await writeSuccessToQueue(request, { issues: results }, options, fileName);
}

async function findExistingIssueByTitle(
  title: string,
  options: RequestProcessorOptions
): Promise<{ number?: number; title?: string; url?: string; state?: string } | null> {
  const spawn = options.spawnSync || spawnSync;
  const args = [
    'issue', 'list',
    '--state', 'all',
    '--json', 'number,title,url,state',
    '--limit', '100',
    '--search', `${title} in:title`
  ];
  const result = spawn('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    // gh unavailable or failed — treat as no existing issue to avoid blocking creation
    return null;
  }

  let issues: unknown[] = [];
  try {
    issues = JSON.parse(result.stdout || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(issues)) return null;

  const normalized = title.trim();
  const existing = issues.find((issue) => {
    if (issue === null || typeof issue !== 'object') return false;
    const issueTitle = (issue as Record<string, unknown>).title;
    return typeof issueTitle === 'string' && issueTitle.trim() === normalized;
  });

  if (!existing || existing === null || typeof existing !== 'object') {
    return null;
  }
  const record = existing as Record<string, unknown>;
  return {
    number: typeof record.number === 'number' ? record.number : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    url: typeof record.url === 'string' ? record.url : undefined,
    state: typeof record.state === 'string' ? record.state : undefined,
  };
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
  const issueState = await findIssueState(request.payload.number, options);
  if (issueState.closed) {
    await writeSessionLogEntry(options.logPath, 'gh_request_skipped_already_closed', {
      type: request.type,
      id: request.id,
      issue_number: request.payload.number,
    });
    await writeSuccessToQueue(request, {
      status: 'closed',
      skipped: true,
      idempotent: true,
      reason: 'already_closed',
      number: issueState.number,
      url: issueState.url,
      title: issueState.title,
    }, options, fileName);
    return;
  }

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

async function findIssueState(
  number: number,
  options: RequestProcessorOptions
): Promise<{ closed: boolean; number?: number; url?: string; title?: string }> {
  const spawn = options.spawnSync || spawnSync;
  const args = ['issue', 'view', String(number), '--json', 'number,title,url,state'];
  const result = spawn('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    // gh unavailable or failed — treat as open to avoid blocking close operations
    return { closed: false };
  }

  let record: unknown;
  try {
    record = JSON.parse(result.stdout || '{}');
  } catch {
    return { closed: false };
  }
  if (record === null || typeof record !== 'object') {
    return { closed: false };
  }

  const issue = record as Record<string, unknown>;
  const state = typeof issue.state === 'string' ? issue.state.toUpperCase() : '';
  return {
    closed: state === 'CLOSED',
    number: typeof issue.number === 'number' ? issue.number : undefined,
    url: typeof issue.url === 'string' ? issue.url : undefined,
    title: typeof issue.title === 'string' ? issue.title : undefined,
  };
}

async function handleCreatePr(request: CreatePrRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
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

async function handleMergePr(request: MergePrRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'pr-merge',
    pr_number: request.payload.number
  }));
  const result = await options.ghCommandRunner('pr-merge', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, { status: 'merged' }, options, fileName);
}

async function findPrMergeState(
  number: number,
  options: RequestProcessorOptions
): Promise<{ merged: boolean; number?: number; url?: string; title?: string }> {
  const spawn = options.spawnSync || spawnSync;
  const args = ['pr', 'view', String(number), '--json', 'number,url,title,state,mergedAt'];
  const result = spawn('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`pr-view failed while checking idempotency for PR #${number}: ${result.stderr || result.stdout}`);
  }

  let record: unknown;
  try {
    record = JSON.parse(result.stdout || '{}');
  } catch (error) {
    throw new Error(`pr-view returned invalid JSON while checking idempotency for PR #${number}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (record === null || typeof record !== 'object') {
    return { merged: false };
  }

  const pr = record as Record<string, unknown>;
  const state = typeof pr.state === 'string' ? pr.state.toUpperCase() : '';
  const mergedAt = typeof pr.mergedAt === 'string' ? pr.mergedAt.trim() : '';
  return {
    merged: state === 'MERGED' || mergedAt.length > 0,
    number: typeof pr.number === 'number' ? pr.number : undefined,
    url: typeof pr.url === 'string' ? pr.url : undefined,
    title: typeof pr.title === 'string' ? pr.title : undefined,
  };
}

async function handleDispatchChild(request: DispatchChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const existingSessionId = await findActiveChildSessionByIssue(request.payload.issue_number, options.aloopDir);
  if (existingSessionId) {
    await writeSessionLogEntry(options.logPath, 'gh_request_skipped_child_already_running', {
      type: request.type,
      id: request.id,
      issue_number: request.payload.issue_number,
      existing_session_id: existingSessionId,
    });
    await writeSuccessToQueue(request, {
      status: 'dispatched',
      skipped: true,
      idempotent: true,
      reason: 'child_session_already_running',
      issue_number: request.payload.issue_number,
      session_id: existingSessionId,
    }, options, fileName);
    return;
  }

  const args = [
    'gh', 'start',
    '--issue', String(request.payload.issue_number),
    '--home-dir', path.dirname(options.aloopDir),
    '--project-root', options.workdir,
    '--output', 'json'
  ];
  
  const spawn = options.spawnSync || spawnSync;
  const result = spawn('aloop', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to dispatch child: ${result.stderr || result.stdout}`);
  }
  
  const output = JSON.parse(result.stdout);
  await writeSuccessToQueue(request, output, options, fileName);
}

async function findActiveChildSessionByIssue(issueNumber: number, aloopDir: string): Promise<string | null> {
  const activePath = path.join(aloopDir, 'active.json');
  if (!existsSync(activePath)) return null;

  let active: unknown;
  try {
    active = JSON.parse(await fs.readFile(activePath, 'utf8'));
  } catch {
    return null;
  }
  if (active === null || typeof active !== 'object' || Array.isArray(active)) {
    return null;
  }

  for (const sessionId of Object.keys(active as Record<string, unknown>)) {
    const sessionMetaPath = path.join(aloopDir, 'sessions', sessionId, 'meta.json');
    if (!existsSync(sessionMetaPath)) continue;

    try {
      const metaRaw = JSON.parse(await fs.readFile(sessionMetaPath, 'utf8'));
      if (metaRaw && typeof metaRaw === 'object') {
        const meta = metaRaw as Record<string, unknown>;
        if (meta.issue_number === issueNumber || meta.gh_issue_number === issueNumber) {
          return sessionId;
        }
      }
    } catch {
      // Ignore bad session metadata for idempotency lookup and continue.
    }
  }

  return null;
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
  const body = await fs.readFile(path.join(options.workdir, request.payload.body_file), 'utf8');
  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'issue-comment',
    issue_number: request.payload.issue_number,
    body
  }));
  const result = await options.ghCommandRunner('issue-comment', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, { status: 'posted' }, options, fileName);
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
