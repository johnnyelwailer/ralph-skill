import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

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
    since?: string;
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
      const archivePath = getArchivePath(processedDir, fileName, reservedArchivePaths);
      await fs.rename(requestPath, archivePath);
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
      await writeFailureToQueue(request, errorMsg, options);
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
      labels: [...(issueReq.labels || []), 'aloop/auto']
    }));
    
    const result = await options.ghCommandRunner('issue-create', options.sessionId, tempRequestPath);
    await fs.unlink(tempRequestPath);
    
    if (result.exitCode !== 0) {
      throw new Error(`issue-create failed: ${result.output}`);
    }
    results.push(JSON.parse(result.output));
  }

  await writeSuccessToQueue(request, { issues: results }, options);
}

async function handleUpdateIssue(request: UpdateIssueRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const args = ['issue', 'edit', String(request.payload.number)];
  if (request.payload.body_file) {
    const body = await fs.readFile(path.join(options.workdir, request.payload.body_file), 'utf8');
    const tempBodyPath = path.join(options.aloopDir, 'requests', `_tmp_body_${request.id}.md`);
    await fs.writeFile(tempBodyPath, body);
    args.push('--body-file', tempBodyPath);
    try {
      const result = spawnSync('gh', args, { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    } finally {
      await fs.unlink(tempBodyPath);
    }
  } else {
    if (request.payload.title) args.push('--title', request.payload.title);
    if (request.payload.state) args.push('--state', request.payload.state);
    if (request.payload.labels_add) {
      for (const l of request.payload.labels_add) args.push('--add-label', l);
    }
    if (request.payload.labels_remove) {
      for (const l of request.payload.labels_remove) args.push('--remove-label', l);
    }
    const result = spawnSync('gh', args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }

  await writeSuccessToQueue(request, { status: 'updated' }, options);
}

async function handleCloseIssue(request: CloseIssueRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const tempRequestPath = path.join(options.aloopDir, 'requests', `_tmp_${request.id}.json`);
  await fs.writeFile(tempRequestPath, JSON.stringify({
    type: 'issue-close',
    issue_number: request.payload.number,
    target_labels: ['aloop/auto'] // Policy check requires this
  }));
  const result = await options.ghCommandRunner('issue-close', options.sessionId, tempRequestPath);
  await fs.unlink(tempRequestPath);
  if (result.exitCode !== 0) throw new Error(result.output);
  await writeSuccessToQueue(request, { status: 'closed' }, options);
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
  await writeSuccessToQueue(request, JSON.parse(result.output), options);
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
  await writeSuccessToQueue(request, { status: 'merged' }, options);
}

async function handleDispatchChild(request: DispatchChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  // This requires calling orchestrate functions. 
  // For now, we'll use a shell command to 'aloop gh start' which is equivalent to dispatching
  // but we should ideally use the internal API.
  const args = [
    'gh', 'start',
    '--issue', String(request.payload.issue_number),
    '--home-dir', path.dirname(options.aloopDir),
    '--project-root', options.workdir,
    '--output', 'json'
  ];
  
  const result = spawnSync('aloop', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to dispatch child: ${result.stderr || result.stdout}`);
  }
  
  const output = JSON.parse(result.stdout);
  await writeSuccessToQueue(request, output, options);
}

async function handleSteerChild(request: SteerChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  // Find child session for issue_number in active sessions
  const homeDir = path.dirname(options.aloopDir);
  const activePath = path.join(options.aloopDir, 'active.json');
  if (!existsSync(activePath)) throw new Error('No active sessions found');
  
  const activeContent = await fs.readFile(activePath, 'utf8');
  const active = JSON.parse(activeContent);
  let childSessionId: string | null = null;
  for (const [id, _session] of Object.entries(active as any)) {
    // Check meta.json in each session to find the issue_number
    const sessionMetaPath = path.join(homeDir, 'sessions', id, 'meta.json');
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

  const childQueueDir = path.join(homeDir, 'sessions', childSessionId, 'queue');
  await fs.mkdir(childQueueDir, { recursive: true });
  
  const steerContent = await fs.readFile(path.join(options.workdir, request.payload.prompt_file), 'utf8');
  const steerFileName = `steer-${new Date().getTime()}.md`;
  await fs.writeFile(path.join(childQueueDir, steerFileName), steerContent);

  await writeSuccessToQueue(request, { status: 'steered', session_id: childSessionId }, options);
}

async function handleStopChild(request: StopChildRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const args = [
    'gh', 'stop',
    '--issue', String(request.payload.issue_number),
    '--home-dir', path.dirname(options.aloopDir),
    '--output', 'json'
  ];
  const result = spawnSync('aloop', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to stop child: ${result.stderr || result.stdout}`);
  }
  await writeSuccessToQueue(request, { status: 'stopped' }, options);
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
  await writeSuccessToQueue(request, { status: 'posted' }, options);
}

async function handleQueryIssues(request: QueryIssuesRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  // Use 'gh issue list'
  const args = ['issue', 'list', '--json', 'number,title,state,labels', '--limit', '100'];
  if (request.payload.labels) {
    for (const l of request.payload.labels) args.push('--label', l);
  }
  if (request.payload.state) args.push('--state', request.payload.state);
  
  // We'll use ghExecutor from gh.ts if we could, but let's just use spawnSync for now
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  
  await writeSuccessToQueue(request, { issues: JSON.parse(result.stdout) }, options);
}

async function handleSpecBackfill(request: SpecBackfillRequest, fileName: string, options: RequestProcessorOptions): Promise<void> {
  const specPath = path.join(options.workdir, request.payload.file);
  const content = await fs.readFile(path.join(options.workdir, request.payload.content_file), 'utf8');
  
  let specContent = await fs.readFile(specPath, 'utf8');
  // Simple replacement or append for now. SPEC says "at section"
  // Assuming section is a header name
  const sectionHeader = `## ${request.payload.section}`;
  if (specContent.includes(sectionHeader)) {
    // Replace section content until next header or end
    const lines = specContent.split('\n');
    const startIdx = lines.findIndex(l => l.startsWith(sectionHeader));
    let endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('## '));
    if (endIdx === -1) endIdx = lines.length;
    
    lines.splice(startIdx + 1, endIdx - startIdx - 1, '', content, '');
    specContent = lines.join('\n');
  } else {
    specContent += `\n\n${sectionHeader}\n\n${content}\n`;
  }
  
  await fs.writeFile(specPath, specContent, 'utf8');
  // Commit the change
  spawnSync('git', ['-C', options.workdir, 'add', request.payload.file], { stdio: 'ignore' });
  spawnSync('git', ['-C', options.workdir, 'commit', '-m', `docs: backfill spec section ${request.payload.section} [aloop]`], { stdio: 'ignore' });
  
  await writeSuccessToQueue(request, { status: 'backfilled', file: request.payload.file }, options);
}

async function writeSuccessToQueue(request: AgentRequest, payload: any, options: RequestProcessorOptions): Promise<void> {
  const queueDir = path.join(options.sessionDir, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  
  const timestamp = new Date().toISOString();
  const fileName = `${new Date().getTime()}-${request.type}-${request.id}.md`;
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

async function writeFailureToQueue(request: AgentRequest, error: string, options: RequestProcessorOptions): Promise<void> {
  const queueDir = path.join(options.sessionDir, 'queue');
  await fs.mkdir(queueDir, { recursive: true });
  
  const timestamp = new Date().toISOString();
  const fileName = `${new Date().getTime()}-failed-${request.type}-${request.id}.md`;
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
