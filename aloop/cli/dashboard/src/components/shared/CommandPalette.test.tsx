import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette } from './CommandPalette';
import type { SessionSummary } from '@/lib/types';

const sessions: SessionSummary[] = [
  { id: 'current', name: 'Current', projectName: 'aloop', status: 'running', phase: 'build', elapsed: '2m', iterations: '5', isActive: true, branch: 'main', startedAt: '', endedAt: '', pid: '1234', provider: 'claude', workDir: '/tmp', stuckCount: 0 },
  { id: 's2', name: 'other-session', projectName: 'other', status: 'stopped', phase: '', elapsed: '--', iterations: '--', isActive: false, branch: '', startedAt: '', endedAt: '', pid: '', provider: '', workDir: '', stuckCount: 0 },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

describe('CommandPalette', () => {
  it('returns null when closed', () => {
    const { container } = render(
      <CommandPalette open={false} onClose={vi.fn()} sessions={sessions} onSelectSession={vi.fn()} onStop={vi.fn()} />,
      { wrapper },
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders actions and sessions when open', () => {
    render(
      <CommandPalette open onClose={vi.fn()} sessions={sessions} onSelectSession={vi.fn()} onStop={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByText('Stop session (graceful)')).toBeInTheDocument();
    expect(screen.getByText('Force stop (SIGKILL)')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('other-session')).toBeInTheDocument();
  });

  it('calls onClose and onStop(false) on graceful stop', () => {
    const onClose = vi.fn();
    const onStop = vi.fn();
    render(
      <CommandPalette open onClose={onClose} sessions={sessions} onSelectSession={vi.fn()} onStop={onStop} />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('Stop session (graceful)'));
    expect(onClose).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledWith(false);
  });

  it('calls onClose and onStop(true) on force stop', () => {
    const onClose = vi.fn();
    const onStop = vi.fn();
    render(
      <CommandPalette open onClose={onClose} sessions={sessions} onSelectSession={vi.fn()} onStop={onStop} />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('Force stop (SIGKILL)'));
    expect(onClose).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledWith(true);
  });

  it('calls onSelectSession with null for current session', () => {
    const onClose = vi.fn();
    const onSelectSession = vi.fn();
    render(
      <CommandPalette open onClose={onClose} sessions={sessions} onSelectSession={onSelectSession} onStop={vi.fn()} />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('Current'));
    expect(onClose).toHaveBeenCalled();
    expect(onSelectSession).toHaveBeenCalledWith(null);
  });

  it('calls onSelectSession with id for non-current session', () => {
    const onSelectSession = vi.fn();
    render(
      <CommandPalette open onClose={vi.fn()} sessions={sessions} onSelectSession={onSelectSession} onStop={vi.fn()} />,
      { wrapper },
    );
    fireEvent.click(screen.getByText('other-session'));
    expect(onSelectSession).toHaveBeenCalledWith('s2');
  });

  it('calls onClose on overlay click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <CommandPalette open onClose={onClose} sessions={sessions} onSelectSession={vi.fn()} onStop={vi.fn()} />,
      { wrapper },
    );
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key on overlay', () => {
    const onClose = vi.fn();
    const { container } = render(
      <CommandPalette open onClose={onClose} sessions={sessions} onSelectSession={vi.fn()} onStop={vi.fn()} />,
      { wrapper },
    );
    const overlay = container.firstChild as HTMLElement;
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
