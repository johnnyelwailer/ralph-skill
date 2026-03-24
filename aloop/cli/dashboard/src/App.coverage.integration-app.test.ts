import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { MockEventSource, baseState } from './App.coverage.test-utils';

describe('App.tsx AppView integration coverage - app controls', () => {
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

  it('renders app and supports steer + stop + command stop', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/steer') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/stop') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return new Response(JSON.stringify({ signal: body.force ? 'SIGKILL' : 'SIGTERM' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    const steerInput = screen.getByPlaceholderText('Steer...');
    expect(steerInput).toHaveClass('min-h-[44px]');
    expect(steerInput).toHaveClass('md:min-h-[32px]');
    expect(steerInput).toHaveClass('h-auto');
    expect(steerInput).toHaveClass('md:h-8');

    fireEvent.change(screen.getByPlaceholderText('Steer...'), { target: { value: 'Adjust scope' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/steer', expect.any(Object));
    });

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByText('Stop session (graceful)'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stop', expect.objectContaining({ method: 'POST' }));
    });

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByText('Force stop (SIGKILL)'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stop', expect.objectContaining({
        body: JSON.stringify({ force: true }),
      }));
    });
  });

  it('shows resume path and handles state-load error/disconnect', async () => {
    let stateCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        stateCalls += 1;
        if (stateCalls === 1) {
          return new Response(JSON.stringify({ ...baseState, status: { ...baseState.status, state: 'stopped' } }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('fail', { status: 500 });
      }
      if (url === '/api/resume') {
        return new Response(JSON.stringify({ pid: 1234 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(createElement(App));
    await screen.findByRole('button', { name: /resume/i });

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/resume', expect.any(Object));
    });

    const sse = MockEventSource.instances[0];
    expect(sse).toBeTruthy();
    sse.emit('state', { ...baseState, updatedAt: '2026-03-19T12:00:10.000Z' });
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    sse.onerror?.();
    await waitFor(() => expect(screen.getByText('Disconnected')).toBeInTheDocument());
    unmount();
  });

  it('covers panel toggles, sidebar shortcut, and session switching', async () => {
    const state = {
      ...baseState,
      activeSessions: [{ session_id: 'sess-1', project_name: 'proj', state: 'running', phase: 'build', iteration: 3 }],
      recentSessions: [{ session_id: 'sess-2', project_name: 'proj', state: 'stopped', phase: 'review', iteration: 9 }],
      repoUrl: 'https://example.com/repo',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: /^activity$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^documents$/i }));

    const collapseBtn = container.querySelector('button .lucide-panel-left-close')?.closest('button') as HTMLButtonElement | null;
    expect(collapseBtn).not.toBeNull();
    fireEvent.click(collapseBtn!);
    const expandBtn = container.querySelector('button .lucide-panel-left-open')?.closest('button') as HTMLButtonElement | null;
    expect(expandBtn).not.toBeNull();
    fireEvent.click(expandBtn!);

    const mobileMenuBtn = container.querySelector('button .lucide-menu')?.closest('button') as HTMLButtonElement | null;
    expect(mobileMenuBtn).not.toBeNull();
    fireEvent.click(mobileMenuBtn!);
    const mobileOverlay = container.querySelector('.fixed.inset-0.z-40') as HTMLDivElement | null;
    expect(mobileOverlay).not.toBeNull();
    fireEvent.click(mobileOverlay!);

    fireEvent.click(screen.getAllByText('sess-1')[0]);
    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith('/api/state?session=sess-1', expect.any(Object));
    });
  });
});
