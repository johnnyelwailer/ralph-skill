import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';
import type { SessionSummary } from '@/lib/types';

const baseSession: SessionSummary = {
  id: 'sess-001',
  name: 'test-session',
  projectName: 'my-project',
  status: 'running',
  phase: 'build',
  elapsed: '5m',
  iterations: '3',
  isActive: true,
  branch: 'main',
  startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  endedAt: '',
  pid: '12345',
  provider: 'claude',
  workDir: '/home/user/project',
  stuckCount: 0,
};

const stoppedSession: SessionSummary = {
  ...baseSession,
  id: 'sess-002',
  name: 'old-session',
  status: 'exited',
  isActive: false,
  startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  endedAt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
};

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const defaults = {
    sessions: [baseSession],
    selectedSessionId: null,
    onSelectSession: vi.fn(),
    collapsed: false,
    onToggle: vi.fn(),
    sessionCost: 0,
  };
  return render(
    <TooltipProvider>
      <Sidebar {...defaults} {...props} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});

describe('Sidebar', () => {
  it('renders session cards in expanded state', async () => {
    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
  });

  it('shows "Sessions" heading when expanded', () => {
    renderSidebar();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('renders collapsed state with expand button', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  it('calls onToggle when expand button is clicked in collapsed state', () => {
    const onToggle = vi.fn();
    renderSidebar({ collapsed: true, onToggle });
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows collapse button for non-desktop mode', () => {
    renderSidebar({ isDesktop: false });
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
  });

  it('does not show collapse button for desktop mode', () => {
    renderSidebar({ isDesktop: true });
    expect(screen.queryByLabelText('Collapse sidebar')).not.toBeInTheDocument();
  });

  it('shows "No sessions." when session list is empty', () => {
    renderSidebar({ sessions: [] });
    expect(screen.getByText('No sessions.')).toBeInTheDocument();
  });

  it('groups sessions by project name', async () => {
    renderSidebar({ sessions: [baseSession] });
    await waitFor(() => {
      expect(screen.getByText('my-project')).toBeInTheDocument();
    });
  });

  it('renders older sessions in collapsed section', async () => {
    renderSidebar({ sessions: [baseSession, stoppedSession] });
    await waitFor(() => {
      expect(screen.getByText('Older')).toBeInTheDocument();
    });
  });

  it('calls onSelectSession when a session card is clicked', async () => {
    const onSelectSession = vi.fn();
    renderSidebar({ onSelectSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('test-session'));
    expect(onSelectSession).toHaveBeenCalled();
  });

  it('renders context menu on right-click at correct position', async () => {
    renderSidebar({ sessions: [baseSession] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 100, clientY: 200 });
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveStyle({ left: '100px', top: '200px' });
  });

  it('"Stop after iteration" calls onStopSession(false) and closes menu', async () => {
    const onStopSession = vi.fn();
    const onSelectSession = vi.fn();
    renderSidebar({ sessions: [baseSession], onStopSession, onSelectSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    await userEvent.click(screen.getByText('Stop after iteration'));
    expect(onSelectSession).toHaveBeenCalledWith('sess-001');
    expect(onStopSession).toHaveBeenCalledWith('sess-001', false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('"Kill immediately" calls onStopSession(true) and closes menu', async () => {
    const onStopSession = vi.fn();
    const onSelectSession = vi.fn();
    renderSidebar({ sessions: [baseSession], onStopSession, onSelectSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    await userEvent.click(screen.getByText('Kill immediately'));
    expect(onSelectSession).toHaveBeenCalledWith('sess-001');
    expect(onStopSession).toHaveBeenCalledWith('sess-001', true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('"Copy session ID" calls onCopySessionId and closes menu', async () => {
    const onCopySessionId = vi.fn();
    renderSidebar({ sessions: [baseSession], onCopySessionId });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    await userEvent.click(screen.getByText('Copy session ID'));
    expect(onCopySessionId).toHaveBeenCalledWith('sess-001');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape key closes context menu', async () => {
    renderSidebar({ sessions: [baseSession] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles older sessions section open and closed', async () => {
    renderSidebar({ sessions: [baseSession, stoppedSession] });
    await waitFor(() => {
      expect(screen.getByText('Older')).toBeInTheDocument();
    });
    const olderTrigger = screen.getByText('Older').closest('button')!;
    // Older sessions should be collapsed by default — old-session not visible
    expect(screen.queryByText('old-session')).not.toBeInTheDocument();
    // Click to expand
    fireEvent.click(olderTrigger);
    await waitFor(() => {
      expect(screen.getByText('old-session')).toBeInTheDocument();
    });
    // Click again to collapse
    fireEvent.click(olderTrigger);
    await waitFor(() => {
      expect(screen.queryByText('old-session')).not.toBeInTheDocument();
    });
  });

  it('fetches session costs for non-current sessions', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ total_usd: 1.23 }),
    });
    vi.stubGlobal('fetch', mockFetch);
    renderSidebar({ sessions: [stoppedSession] });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/cost/session/sess-002');
    });
  });

  describe('cost API branch outputs', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      // Mock touch device so the tooltip opens on click (no hover-delay needed).
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: true,
          media: '(hover: none), (pointer: coarse)',
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
      vi.useFakeTimers();
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('handles cost API returning opencode_unavailable error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'opencode_unavailable' }),
      }));
      renderSidebar({ sessions: [stoppedSession] });
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('Older').closest('button')!);
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('old-session').closest('button')!);
      expect(screen.getByRole('tooltip')).toHaveTextContent('Cost: unavailable');
    });

    it('handles cost API returning string total_usd', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total_usd: '2.50' }),
      }));
      renderSidebar({ sessions: [stoppedSession] });
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('Older').closest('button')!);
      await act(async () => { await vi.runAllTimersAsync(); });
      expect(screen.getByText(/\$2\.5000/)).toBeInTheDocument();
    });

    it('handles cost API returning non-number non-string total_usd', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total_usd: null }),
      }));
      renderSidebar({ sessions: [stoppedSession] });
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('Older').closest('button')!);
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('old-session').closest('button')!);
      expect(screen.getByRole('tooltip')).not.toHaveTextContent('Cost:');
    });

    it('handles cost API fetch rejection', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
      renderSidebar({ sessions: [stoppedSession] });
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('Older').closest('button')!);
      await act(async () => { await vi.runAllTimersAsync(); });
      fireEvent.click(screen.getByText('old-session').closest('button')!);
      expect(screen.getByRole('tooltip')).not.toHaveTextContent('Cost:');
    });
  });

  it('renders session dots in collapsed state and handles "current" id click', async () => {
    const onSelectSession = vi.fn();
    const currentSession: SessionSummary = { ...baseSession, id: 'current', name: 'current-session' };
    renderSidebar({ collapsed: true, sessions: [currentSession], onSelectSession });
    // Find the session dot buttons (inside the collapsed sidebar)
    const sidebar = screen.getByRole('complementary');
    const buttons = sidebar.querySelectorAll('button');
    // First button is expand, second is the session dot
    const sessionDot = buttons[1] as HTMLElement;
    fireEvent.click(sessionDot);
    // clicking 'current' session should pass null
    expect(onSelectSession).toHaveBeenCalledWith(null);
  });

  it('renders non-current session dot in collapsed state with correct click id', async () => {
    const onSelectSession = vi.fn();
    renderSidebar({ collapsed: true, sessions: [baseSession], onSelectSession });
    const sidebar = screen.getByRole('complementary');
    const buttons = sidebar.querySelectorAll('button');
    const sessionDot = buttons[1] as HTMLElement;
    fireEvent.click(sessionDot);
    expect(onSelectSession).toHaveBeenCalledWith('sess-001');
  });

  it('renders sessions without projectName under "Unknown" group', async () => {
    const noProject: SessionSummary = { ...baseSession, projectName: '' };
    renderSidebar({ sessions: [noProject] });
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('renders sessions without lastActivity as active (infinite age)', async () => {
    const noActivity: SessionSummary = { ...baseSession, startedAt: '', endedAt: '' };
    renderSidebar({ sessions: [noActivity] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
  });

  it('selects first session when selectedSessionId is null', async () => {
    renderSidebar({ selectedSessionId: null, sessions: [baseSession] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
  });

  it('handles "current" context menu stop session with null selectId', async () => {
    const onStopSession = vi.fn();
    const onSelectSession = vi.fn();
    const currentSession: SessionSummary = { ...baseSession, id: 'current' };
    renderSidebar({ sessions: [currentSession], onStopSession, onSelectSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    await userEvent.click(screen.getByText('Stop after iteration'));
    expect(onSelectSession).toHaveBeenCalledWith(null);
    expect(onStopSession).toHaveBeenCalledWith(null, false);
  });

  it('handles "current" context menu kill with null selectId', async () => {
    const onStopSession = vi.fn();
    const currentSession: SessionSummary = { ...baseSession, id: 'current' };
    renderSidebar({ sessions: [currentSession], onStopSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    await userEvent.click(screen.getByText('Kill immediately'));
    expect(onStopSession).toHaveBeenCalledWith(null, true);
  });

  it('matches selectedSessionId to session id for isSelected', async () => {
    renderSidebar({ selectedSessionId: 'sess-001', sessions: [baseSession] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
  });

  it('does not match selectedSessionId to non-existent session', async () => {
    renderSidebar({ selectedSessionId: 'non-existent', sessions: [baseSession] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
  });

  it('renders "current" session card with null onSelect', async () => {
    const onSelectSession = vi.fn();
    const currentSession: SessionSummary = { ...baseSession, id: 'current' };
    renderSidebar({ sessions: [currentSession], onSelectSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('test-session'));
    expect(onSelectSession).toHaveBeenCalledWith(null);
  });

  it('renders non-active non-running session card', async () => {
    const exitedSession: SessionSummary = { ...baseSession, isActive: false, status: 'exited' };
    renderSidebar({ sessions: [exitedSession] });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
  });

  it('suppresses click after context menu opens', async () => {
    const onSelectSession = vi.fn();
    renderSidebar({ sessions: [baseSession], onSelectSession });
    await waitFor(() => {
      expect(screen.getByText('test-session')).toBeInTheDocument();
    });
    const card = screen.getByText('test-session').closest('button')!;
    // Right-click to open context menu (which sets suppressClickSessionId)
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });
    // Close the menu via Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    // Click should be suppressed (onSelectSession should NOT be called again)
    fireEvent.click(card);
    expect(onSelectSession).not.toHaveBeenCalled();
  });
});
