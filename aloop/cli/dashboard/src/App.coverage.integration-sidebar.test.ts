import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, Sidebar } from './App';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { TooltipProvider } from './components/ui/tooltip';
import { MockEventSource, baseState } from './App.coverage.test-utils';

describe('App.tsx AppView integration coverage - sidebar', () => {
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

  it('covers older-session grouping and docs overflow branches', async () => {
    const state = {
      ...baseState,
      status: null,
      activeSessions: [],
      recentSessions: [
        {
          session_id: 'old-1',
          project_name: 'legacy',
          state: 'exited',
          phase: 'review',
          iteration: 12,
          started_at: '2020-01-01T00:00:00.000Z',
          ended_at: '2020-01-01T01:00:00.000Z',
        },
      ],
      docs: {
        'TODO.md': '# TODO',
        'SPEC.md': '# SPEC',
        'RESEARCH.md': '# RESEARCH',
        'REVIEW_LOG.md': '# REVIEW',
        'STEERING.md': '# STEER',
        'EXTRA.md': '# EXTRA DOC CONTENT',
      },
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
    await screen.findByText('Older');
    fireEvent.click(screen.getByText('Older'));

    const repoLink = screen.getByRole('link', { name: /open repo on github/i });
    expect(repoLink).not.toBeNull();

    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    const collapsedSessionBtn = container.querySelector('aside .mt-3 button');
    expect(collapsedSessionBtn).not.toBeNull();
    fireEvent.click(collapsedSessionBtn!);
    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalled();
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: /open overflow document tabs/i }));
    fireEvent.click(await screen.findByText('STEERING'));
    await screen.findByRole('heading', { name: 'STEER' });

    fireEvent.pointerDown(screen.getByRole('button', { name: /open overflow document tabs/i }));
    fireEvent.click(await screen.findByText('EXTRA'));
    await screen.findByRole('heading', { name: 'EXTRA DOC CONTENT' });
  });

  it('covers Sidebar exhaustive', () => {
    const sessions = [
      { id: 's1', name: 's1', projectName: 'p1', status: 'running', phase: 'build', iteration: '1', isActive: true, branch: 'b1', startedAt: 't', endedAt: '', pid: '1', provider: 'c', workDir: 'w', stuckCount: 0 },
      { id: 's2', name: 's2', projectName: 'p1', status: 'exited', phase: 'build', iteration: '1', isActive: false, branch: 'b1', startedAt: 't', endedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), pid: '2', provider: 'c', workDir: 'w', stuckCount: 0 },
    ];
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(createElement(TooltipProvider as any, {}, createElement(Sidebar, {
      sessions: sessions as any[],
      selectedSessionId: 's1',
      onSelectSession: onSelect,
      collapsed: false,
      onToggle: onToggle,
      sessionCost: 0.1234,
    })));
    expect(screen.getByText('p1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('s1'));
    expect(onSelect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Older/i));
    expect(screen.getByText('s2')).toBeInTheDocument();
  });

  it('runs session context-menu actions', async () => {
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    const sessions = [
      {
        id: 'sess-long-1',
        name: 'sess-long-1',
        projectName: 'proj',
        status: 'running',
        phase: 'build',
        iteration: '1',
        isActive: true,
        branch: 'main',
        startedAt: new Date().toISOString(),
        endedAt: '',
        pid: '11',
        provider: 'codex',
        workDir: '/tmp/work',
        stuckCount: 0,
      },
    ];
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onStopSession = vi.fn();
    const onCopySessionId = vi.fn();

    render(createElement(TooltipProvider as any, {}, createElement(Sidebar, {
      sessions: sessions as any[],
      selectedSessionId: 'sess-long-1',
      onSelectSession: onSelect,
      collapsed: false,
      onToggle: onToggle,
      sessionCost: 0.25,
      onStopSession: onStopSession,
      onCopySessionId: onCopySessionId,
    })));

    fireEvent.contextMenu(screen.getByRole('button', { name: /sess-long-1/i }), { clientX: 50, clientY: 75 });
    expect(await screen.findByText('Copy session ID')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Stop after iteration'));
    expect(onSelect).toHaveBeenCalledWith('sess-long-1');
    expect(onStopSession).toHaveBeenCalledWith('sess-long-1', false);

    fireEvent.contextMenu(screen.getByRole('button', { name: /sess-long-1/i }), { clientX: 50, clientY: 75 });
    fireEvent.click(await screen.findByText('Kill immediately'));
    expect(onStopSession).toHaveBeenCalledWith('sess-long-1', true);

    fireEvent.contextMenu(screen.getByRole('button', { name: /sess-long-1/i }), { clientX: 50, clientY: 75 });
    fireEvent.click(await screen.findByText('Copy session ID'));
    expect(onCopySessionId).toHaveBeenCalledWith('sess-long-1');
  });
});
