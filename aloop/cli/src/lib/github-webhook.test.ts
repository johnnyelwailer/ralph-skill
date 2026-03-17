import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WebhookServer,
  isRelevantWebhookEvent,
  extractInvalidationKey,
  type WebhookEvent,
  type WebhookEventHandler,
} from './github-webhook.js';

// --- isRelevantWebhookEvent tests ---

describe('isRelevantWebhookEvent', () => {
  function makeEvent(type: string, action: string): WebhookEvent {
    return {
      type,
      action,
      repository: 'test/repo',
      timestamp: new Date().toISOString(),
      raw: {},
    };
  }

  it('accepts relevant issue events', () => {
    assert.ok(isRelevantWebhookEvent(makeEvent('issues', 'opened')));
    assert.ok(isRelevantWebhookEvent(makeEvent('issues', 'closed')));
    assert.ok(isRelevantWebhookEvent(makeEvent('issues', 'reopened')));
    assert.ok(isRelevantWebhookEvent(makeEvent('issues', 'labeled')));
    assert.ok(isRelevantWebhookEvent(makeEvent('issues', 'unlabeled')));
    assert.ok(isRelevantWebhookEvent(makeEvent('issues', 'edited')));
  });

  it('rejects irrelevant issue events', () => {
    assert.ok(!isRelevantWebhookEvent(makeEvent('issues', 'deleted')));
    assert.ok(!isRelevantWebhookEvent(makeEvent('issues', 'pinned')));
  });

  it('accepts relevant PR events', () => {
    assert.ok(isRelevantWebhookEvent(makeEvent('pull_request', 'opened')));
    assert.ok(isRelevantWebhookEvent(makeEvent('pull_request', 'closed')));
    assert.ok(isRelevantWebhookEvent(makeEvent('pull_request', 'synchronize')));
    assert.ok(isRelevantWebhookEvent(makeEvent('pull_request', 'ready_for_review')));
  });

  it('rejects irrelevant PR events', () => {
    assert.ok(!isRelevantWebhookEvent(makeEvent('pull_request', 'assigned')));
    assert.ok(!isRelevantWebhookEvent(makeEvent('pull_request', 'locked')));
  });

  it('accepts check_run and check_suite events', () => {
    assert.ok(isRelevantWebhookEvent(makeEvent('check_run', 'completed')));
    assert.ok(isRelevantWebhookEvent(makeEvent('check_suite', 'requested')));
  });

  it('accepts issue_comment events', () => {
    assert.ok(isRelevantWebhookEvent(makeEvent('issue_comment', 'created')));
    assert.ok(isRelevantWebhookEvent(makeEvent('issue_comment', 'edited')));
    assert.ok(!isRelevantWebhookEvent(makeEvent('issue_comment', 'deleted')));
  });

  it('accepts projects_v2_item events', () => {
    assert.ok(isRelevantWebhookEvent(makeEvent('projects_v2_item', 'created')));
    assert.ok(isRelevantWebhookEvent(makeEvent('projects_v2_item', 'archived')));
  });

  it('rejects unknown event types', () => {
    assert.ok(!isRelevantWebhookEvent(makeEvent('unknown', 'action')));
  });
});

// --- extractInvalidationKey tests ---

describe('extractInvalidationKey', () => {
  function makeEvent(type: string, overrides: Partial<WebhookEvent> = {}): WebhookEvent {
    return {
      type,
      action: 'opened',
      repository: 'owner/repo',
      timestamp: new Date().toISOString(),
      raw: {},
      ...overrides,
    };
  }

  it('returns issue key for issue events', () => {
    const key = extractInvalidationKey(makeEvent('issues', { issueNumber: 42 }));
    assert.equal(key, 'GET:repos/owner/repo/issues/42');
  });

  it('returns PR key for PR events', () => {
    const key = extractInvalidationKey(makeEvent('pull_request', { prNumber: 100 }));
    assert.equal(key, 'GET:repos/owner/repo/pulls/100');
  });

  it('returns PR key for PR review events', () => {
    const key = extractInvalidationKey(makeEvent('pull_request_review', { prNumber: 50 }));
    assert.equal(key, 'GET:repos/owner/repo/pulls/50');
  });

  it('returns comment key for issue comment events', () => {
    const key = extractInvalidationKey(makeEvent('issue_comment', { issueNumber: 10 }));
    assert.equal(key, 'GET:repos/owner/repo/issues/10/comments');
  });

  it('returns repo prefix for check events', () => {
    const key = extractInvalidationKey(makeEvent('check_run'));
    assert.equal(key, 'GET:repos/owner/repo/');
  });

  it('returns null without repository', () => {
    const key = extractInvalidationKey(makeEvent('issues', { repository: undefined }));
    assert.equal(key, null);
  });
});

// --- WebhookServer tests ---

describe('WebhookServer', () => {
  it('starts and stops successfully', async () => {
    const events: WebhookEvent[] = [];
    const handler: WebhookEventHandler = (event) => {
      events.push(event);
    };

    const server = new WebhookServer({ port: 0, secret: undefined }, handler);
    await server.start();

    const state = server.getState();
    assert.equal(state.running, true);
    assert.equal(state.eventsReceived, 0);

    await server.stop();
    const stoppedState = server.getState();
    assert.equal(stoppedState.running, false);
  });

  it('processes valid webhook events', async () => {
    const events: WebhookEvent[] = [];
    const handler: WebhookEventHandler = (event) => {
      events.push(event);
    };

    const server = new WebhookServer({ port: 0, secret: undefined, path: '/webhook' }, handler);
    await server.start();

    // Get the actual port assigned
    const state = server.getState();
    const port = state.port;

    // Send a webhook event
    const payload = JSON.stringify({
      action: 'opened',
      issue: { number: 42 },
      repository: { full_name: 'test/repo' },
      sender: { login: 'user1' },
    });

    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'issues',
      },
      body: payload,
    });

    assert.equal(response.status, 200);
    const body = await response.json() as { received: boolean };
    assert.equal(body.received, true);

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'issues');
    assert.equal(events[0].action, 'opened');
    assert.equal(events[0].issueNumber, 42);
    assert.equal(events[0].repository, 'test/repo');
    assert.equal(events[0].sender, 'user1');

    const finalState = server.getState();
    assert.equal(finalState.eventsReceived, 1);

    await server.stop();
  });

  it('rejects invalid signature when secret is configured', async () => {
    const handler: WebhookEventHandler = () => {};

    const server = new WebhookServer({ port: 0, secret: 'test-secret' }, handler);
    await server.start();

    const state = server.getState();
    const port = state.port;

    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'issues',
        'x-hub-signature-256': 'sha256=invalid',
      },
      body: '{}',
    });

    assert.equal(response.status, 401);

    const errorState = server.getState();
    assert.equal(errorState.errors, 1);

    await server.stop();
  });

  it('accepts valid signature when secret is configured', async () => {
    const events: WebhookEvent[] = [];
    const handler: WebhookEventHandler = (event) => { events.push(event); };
    const secret = 'my-secret';

    const server = new WebhookServer({ port: 0, secret }, handler);
    await server.start();

    const state = server.getState();
    const port = state.port;

    const payload = JSON.stringify({
      action: 'opened',
      issue: { number: 1 },
      repository: { full_name: 'test/repo' },
      sender: { login: 'bot' },
    });

    // Compute correct signature using Node.js crypto
    const { createHmac } = await import('node:crypto');
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'issues',
        'x-hub-signature-256': signature,
      },
      body: payload,
    });

    assert.equal(response.status, 200);
    assert.equal(events.length, 1);
    assert.equal(events[0].issueNumber, 1);

    await server.stop();
  });

  it('returns 404 for wrong path', async () => {
    const handler: WebhookEventHandler = () => {};
    const server = new WebhookServer({ port: 0 }, handler);
    await server.start();

    const port = server.getState().port;

    const response = await fetch(`http://127.0.0.1:${port}/wrong-path`, {
      method: 'POST',
      body: '{}',
    });

    assert.equal(response.status, 404);
    await server.stop();
  });

  it('returns 404 for GET requests', async () => {
    const handler: WebhookEventHandler = () => {};
    const server = new WebhookServer({ port: 0 }, handler);
    await server.start();

    const port = server.getState().port;

    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'GET',
    });

    assert.equal(response.status, 404);
    await server.stop();
  });
});
