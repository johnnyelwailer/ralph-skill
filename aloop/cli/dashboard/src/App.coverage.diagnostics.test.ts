import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { MockEventSource, baseState } from './App.coverage.test-utils';

describe('App.tsx DiagnosticsBanner', () => {
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

  it('does not render banner when diagnostics is null', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({ ...baseState, diagnostics: null }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render banner when health is healthy', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'healthy',
            blockers: [],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders amber banner when health is degraded', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'degraded',
            blockers: [
              {
                type: 'child_stuck',
                message: 'Child session stuck for 5 iterations',
                first_seen_iteration: 1,
                current_iteration: 5,
                severity: 'warning' as const,
                suggested_fix: 'Check child session logs',
              },
            ],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-testid', 'diagnostics-banner');
    expect(banner).toHaveClass('bg-amber-500');
    expect(screen.getByText(/Degraded/)).toBeInTheDocument();
    expect(screen.getByText(/Child session stuck for 5 iterations/)).toBeInTheDocument();
  });

  it('renders red banner when health is critical', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'critical',
            blockers: [
              {
                type: 'ci_failure',
                message: 'CI failing for 10 iterations',
                first_seen_iteration: 1,
                current_iteration: 10,
                severity: 'critical' as const,
                suggested_fix: 'Review CI logs',
              },
              {
                type: 'pr_conflict',
                message: 'PR merge conflict',
                first_seen_iteration: 3,
                current_iteration: 10,
                severity: 'warning' as const,
                suggested_fix: 'Rebase branch',
              },
            ],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('bg-red-600');
    expect(screen.getByText(/Critical/)).toBeInTheDocument();
    expect(screen.getByText(/CI failing for 10 iterations/)).toBeInTheDocument();
    expect(screen.getByText(/PR merge conflict/)).toBeInTheDocument();
  });

  it('dismisses banner on close button click', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'degraded',
            blockers: [
              {
                type: 'child_stuck',
                message: 'Stuck child',
                first_seen_iteration: 1,
                current_iteration: 5,
                severity: 'warning' as const,
                suggested_fix: 'Restart',
              },
            ],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss alert/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render banner when overall_health is undefined', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: undefined,
            blockers: [],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders banner heading but no list when health is degraded and blockers is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'degraded',
            blockers: [],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    const banner = screen.getByRole('alert');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/Degraded/)).toBeInTheDocument();
    expect(banner.querySelector('ul')).not.toBeInTheDocument();
  });

  it('omits suggested fix span when suggested_fix is empty string', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'degraded',
            blockers: [
              {
                type: 'child_stuck',
                message: 'Child session stuck',
                first_seen_iteration: 1,
                current_iteration: 5,
                severity: 'warning' as const,
                suggested_fix: '',
              },
            ],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Child session stuck')).toBeInTheDocument();
    expect(screen.queryByText(/— /)).not.toBeInTheDocument();
  });

  it('shows +N more when more than 3 blockers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify({
          ...baseState,
          diagnostics: {
            overall_health: 'critical',
            blockers: [
              { type: 'child_stuck', message: 'Blocker 1', first_seen_iteration: 1, current_iteration: 5, severity: 'warning' as const, suggested_fix: 'Fix 1' },
              { type: 'ci_failure', message: 'Blocker 2', first_seen_iteration: 2, current_iteration: 5, severity: 'warning' as const, suggested_fix: 'Fix 2' },
              { type: 'pr_conflict', message: 'Blocker 3', first_seen_iteration: 3, current_iteration: 5, severity: 'warning' as const, suggested_fix: 'Fix 3' },
              { type: 'dispatch_failure', message: 'Blocker 4', first_seen_iteration: 4, current_iteration: 5, severity: 'critical' as const, suggested_fix: 'Fix 4' },
            ],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    expect(screen.getByText('+1 more')).toBeInTheDocument();
    expect(screen.queryByText('Blocker 4')).not.toBeInTheDocument();
  });
});
