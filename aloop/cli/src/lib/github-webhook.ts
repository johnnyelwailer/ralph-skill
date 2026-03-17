import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

// --- Types ---

export interface WebhookConfig {
  port: number;
  secret?: string;
  path?: string;
}

export interface WebhookEvent {
  type: string;
  action: string;
  repository?: string;
  issueNumber?: number;
  prNumber?: number;
  sender?: string;
  timestamp: string;
  raw: unknown;
}

export type WebhookEventHandler = (event: WebhookEvent) => Promise<void> | void;

export interface WebhookServerState {
  running: boolean;
  port: number;
  eventsReceived: number;
  lastEventAt: string | null;
  errors: number;
}

// --- Signature Verification ---

function verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// --- Event Parsing ---

function parseWebhookEvent(headers: IncomingMessage['headers'], body: unknown): WebhookEvent | null {
  const eventType = headers['x-github-event'];
  if (typeof eventType !== 'string') return null;

  const payload = body as Record<string, unknown>;
  const action = typeof payload.action === 'string' ? payload.action : 'unknown';

  const repo = payload.repository as Record<string, unknown> | undefined;
  const repository = typeof repo?.full_name === 'string' ? repo.full_name : undefined;

  const issue = payload.issue as Record<string, unknown> | undefined;
  const issueNumber = typeof issue?.number === 'number' ? issue.number : undefined;

  const pr = payload.pull_request as Record<string, unknown> | undefined;
  const prNumber = typeof pr?.number === 'number' ? pr.number : undefined;

  const sender = payload.sender as Record<string, unknown> | undefined;

  return {
    type: eventType,
    action,
    repository,
    issueNumber,
    prNumber,
    sender: typeof sender?.login === 'string' ? sender.login : undefined,
    timestamp: new Date().toISOString(),
    raw: body,
  };
}

// --- Webhook Server ---

export class WebhookServer {
  private config: WebhookConfig;
  private handler: WebhookEventHandler;
  private server: ReturnType<typeof createServer> | null = null;
  private state: WebhookServerState;

  constructor(config: WebhookConfig, handler: WebhookEventHandler) {
    this.config = {
      path: '/webhook',
      ...config,
    };
    this.handler = handler;
    this.state = {
      running: false,
      port: config.port,
      eventsReceived: 0,
      lastEventAt: null,
      errors: 0,
    };
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res);
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, () => {
        this.state.running = true;
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.state.port = addr.port;
        }
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.state.running = false;
        this.server = null;
        resolve();
      });
    });
  }

  getState(): WebhookServerState {
    return { ...this.state };
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Only accept POST to the webhook path
    if (req.method !== 'POST' || req.url !== this.config.path) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    // Collect body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');

    // Verify signature if secret is configured
    if (this.config.secret) {
      const rawSignature = req.headers['x-hub-signature-256'];
      const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
      if (!verifySignature(rawBody, signature, this.config.secret)) {
        this.state.errors++;
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
    }

    // Parse and handle event
    try {
      const body = JSON.parse(rawBody);
      const event = parseWebhookEvent(req.headers, body);
      if (!event) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_event' }));
        return;
      }

      this.state.eventsReceived++;
      this.state.lastEventAt = event.timestamp;

      await this.handler(event);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    } catch (error) {
      this.state.errors++;
      const msg = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'handler_error', message: msg }));
    }
  }
}

// --- Relevance Filter ---

/**
 * Determine if a webhook event is relevant to the orchestrator.
 * Filters out events that don't require action.
 */
export function isRelevantWebhookEvent(event: WebhookEvent): boolean {
  // Issues: opened, closed, reopened, labeled, unlabeled, edited
  if (event.type === 'issues') {
    return ['opened', 'closed', 'reopened', 'labeled', 'unlabeled', 'edited'].includes(event.action);
  }

  // Pull requests: opened, closed, synchronize, ready_for_review, review_requested
  if (event.type === 'pull_request') {
    return ['opened', 'closed', 'synchronize', 'ready_for_review', 'review_requested'].includes(event.action);
  }

  // PR review comments (line-level)
  if (event.type === 'pull_request_review') {
    return ['submitted', 'edited'].includes(event.action);
  }

  // Issue/PR comments
  if (event.type === 'issue_comment') {
    return ['created', 'edited'].includes(event.action);
  }

  // Check run / check suite events
  if (event.type === 'check_run' || event.type === 'check_suite') {
    return ['completed', 'requested', 'rerequested'].includes(event.action);
  }

  // Project item events
  if (event.type === 'projects_v2_item') {
    return true;
  }

  return false;
}

/**
 * Extract a cache invalidation key from a webhook event.
 * Returns the resource prefix that should be invalidated in the ETag cache.
 */
export function extractInvalidationKey(event: WebhookEvent): string | null {
  if (!event.repository) return null;

  const repo = event.repository;

  if (event.type === 'issues' && event.issueNumber) {
    return `GET:repos/${repo}/issues/${event.issueNumber}`;
  }

  if ((event.type === 'pull_request' || event.type === 'pull_request_review') && event.prNumber) {
    return `GET:repos/${repo}/pulls/${event.prNumber}`;
  }

  if (event.type === 'issue_comment' && event.issueNumber) {
    return `GET:repos/${repo}/issues/${event.issueNumber}/comments`;
  }

  if (event.type === 'check_run' || event.type === 'check_suite') {
    // Invalidate all check-run caches for this repo
    return `GET:repos/${repo}/`;
  }

  // Generic: invalidate the repo prefix
  return `GET:repos/${repo}/`;
}
