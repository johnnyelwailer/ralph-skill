import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { MockEventSource, baseState } from './App.coverage.test-utils';

describe('App.tsx AppView integration coverage - QA badge', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses yellow QA badge styling for 50-79% coverage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/qa-coverage')) {
        return new Response(JSON.stringify({
          coverage_percent: 55,
          total_features: 2,
          tested_features: 1,
          passed: 1,
          failed: 0,
          untested: 1,
          available: true,
          features: [
            { feature: 'Login', component: 'auth', last_tested: '2026-03-20', commit: 'abc1234', status: 'PASS', criteria_met: '2/2', notes: '' },
            { feature: 'Export', component: 'reporting', last_tested: '', commit: '', status: 'UNTESTED', criteria_met: '', notes: 'pending' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    const badge = await screen.findByRole('button', { name: /qa 55%/i });
    expect(badge.className).toContain('border-yellow-500/40');
  });

  it('renders structured QA feature statuses in expanded badge view', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/qa-coverage')) {
        return new Response(JSON.stringify({
          coverage_percent: 67,
          total_features: 3,
          tested_features: 2,
          passed: 1,
          failed: 1,
          untested: 1,
          available: true,
          features: [
            { feature: 'Login', component: 'auth', last_tested: '2026-03-20', commit: 'abc1234', status: 'PASS', criteria_met: '2/2', notes: '' },
            { feature: 'Dashboard health', component: 'dashboard', last_tested: '2026-03-20', commit: 'def5678', status: 'FAIL', criteria_met: '1/2', notes: 'missing empty state' },
            { feature: 'Export', component: 'reporting', last_tested: '', commit: '', status: 'UNTESTED', criteria_met: '', notes: 'pending' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    const badge = await screen.findByRole('button', { name: /qa 67%/i });
    fireEvent.click(badge);

    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Dashboard health')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAIL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNTESTED').length).toBeGreaterThan(0);
  });

  it('refreshes QA coverage only for iteration_complete events in qa phase', async () => {
    let qaCoverageCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/qa-coverage')) {
        qaCoverageCalls += 1;
        return new Response(JSON.stringify({
          coverage_percent: 55,
          total_features: 2,
          tested_features: 1,
          passed: 1,
          failed: 0,
          untested: 1,
          available: true,
          features: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /qa 55%/i });
    expect(qaCoverageCalls).toBe(1);

    const sse = MockEventSource.instances[0];
    expect(sse).toBeTruthy();

    sse.emit('state', {
      ...baseState,
      updatedAt: '2026-03-19T12:00:10.000Z',
      log: `${JSON.stringify({ event: 'iteration_complete', phase: 'build', provider: 'claude', timestamp: '2026-03-19T12:00:10.000Z' })}\n`,
    });
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    expect(qaCoverageCalls).toBe(1);

    sse.emit('state', {
      ...baseState,
      updatedAt: '2026-03-19T12:00:20.000Z',
      log: `${JSON.stringify({ event: 'iteration_complete', phase: 'qa', provider: 'claude', timestamp: '2026-03-19T12:00:20.000Z', iteration: 9 })}\n`,
    });
    await waitFor(() => expect(qaCoverageCalls).toBe(2));

    sse.emit('state', {
      ...baseState,
      updatedAt: '2026-03-19T12:00:30.000Z',
      log: `${JSON.stringify({ event: 'iteration_complete', phase: 'review', provider: 'claude', timestamp: '2026-03-19T12:00:30.000Z' })}\n`,
    });
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    expect(qaCoverageCalls).toBe(2);
  });
});
