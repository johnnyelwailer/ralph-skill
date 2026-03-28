import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
