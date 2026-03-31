import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CollapsedSidebar } from './CollapsedSidebar';
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
  startedAt: new Date().toISOString(),
  endedAt: '',
  pid: '12345',
  provider: 'claude',
  workDir: '/home/user/project',
  stuckCount: 0,
};

function renderCollapsedSidebar(props: Partial<React.ComponentProps<typeof CollapsedSidebar>> = {}) {
  const defaults = {
    sessions: [baseSession],
    onSelectSession: vi.fn(),
    onToggle: vi.fn(),
  };
  return render(
    <TooltipProvider>
      <CollapsedSidebar {...defaults} {...props} />
    </TooltipProvider>,
  );
}

describe('CollapsedSidebar', () => {
  it('renders expand sidebar button', () => {
    renderCollapsedSidebar();
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  it('calls onToggle when expand button is clicked', () => {
    const onToggle = vi.fn();
    renderCollapsedSidebar({ onToggle });
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders session dots for each session', () => {
    renderCollapsedSidebar({ sessions: [baseSession] });
    const sidebar = screen.getByRole('complementary');
    // expand button + 1 session dot
    const buttons = sidebar.querySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  it('calls onSelectSession with session id when session dot is clicked', () => {
    const onSelectSession = vi.fn();
    renderCollapsedSidebar({ sessions: [baseSession], onSelectSession });
    const sidebar = screen.getByRole('complementary');
    const buttons = sidebar.querySelectorAll('button');
    fireEvent.click(buttons[1]);
    expect(onSelectSession).toHaveBeenCalledWith('sess-001');
  });

  it('calls onSelectSession with null for "current" session id', () => {
    const onSelectSession = vi.fn();
    const currentSession: SessionSummary = { ...baseSession, id: 'current' };
    renderCollapsedSidebar({ sessions: [currentSession], onSelectSession });
    const sidebar = screen.getByRole('complementary');
    const buttons = sidebar.querySelectorAll('button');
    fireEvent.click(buttons[1]);
    expect(onSelectSession).toHaveBeenCalledWith(null);
  });

  it('renders empty state with only expand button when no sessions', () => {
    renderCollapsedSidebar({ sessions: [] });
    const sidebar = screen.getByRole('complementary');
    const buttons = sidebar.querySelectorAll('button');
    expect(buttons.length).toBe(1);
  });

  it('limits displayed sessions to 8', () => {
    const manySessions = Array.from({ length: 12 }, (_, i) => ({
      ...baseSession,
      id: `sess-${i}`,
      name: `session-${i}`,
    }));
    renderCollapsedSidebar({ sessions: manySessions });
    const sidebar = screen.getByRole('complementary');
    const buttons = sidebar.querySelectorAll('button');
    // expand button + 8 session dots (not 12)
    expect(buttons.length).toBe(9);
  });
});
