import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SessionCard, type SessionCardSession } from '@/components/session/SessionCard';
import { TooltipProvider } from '@/components/ui/tooltip';

const mkSession = (overrides: Partial<SessionCardSession> = {}): SessionCardSession => ({
  id: 'session-1',
  name: 'Session One',
  status: 'stopped',
  phase: 'build',
  iterations: '3',
  isActive: false,
  branch: 'feature/abc',
  startedAt: '2026-03-22T08:00:00.000Z',
  endedAt: '2026-03-22T08:30:00.000Z',
  pid: '1234',
  provider: 'claude',
  workDir: '/tmp/work',
  stuckCount: 0,
  ...overrides,
});

describe('SessionCard', () => {
  it('hides branch, phase and iteration details when empty', () => {
    const onSelectSession = vi.fn();
    const session = mkSession({ branch: '', phase: '', iterations: '--' });

    const { container } = render(
      <SessionCard session={session} selected={false} onSelectSession={onSelectSession} />,
      { wrapper: TooltipProvider },
    );

    expect(screen.queryByText('iter')).not.toBeInTheDocument();
    expect(screen.queryByText('--')).not.toBeInTheDocument();

    const detailsRow = container.querySelector('button > div:nth-child(2)');
    expect(detailsRow?.textContent?.trim()).toBe('');
  });

  it('sends null when selecting the current pseudo-session', () => {
    const onSelectSession = vi.fn();
    render(
      <SessionCard
        session={mkSession({ id: 'current' })}
        selected={false}
        onSelectSession={onSelectSession}
      />,
      { wrapper: TooltipProvider },
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onSelectSession).toHaveBeenCalledWith(null);
  });

  it('sends the session id when selecting a normal session', () => {
    const onSelectSession = vi.fn();
    render(
      <SessionCard
        session={mkSession({ id: 'session-42' })}
        selected={false}
        onSelectSession={onSelectSession}
      />,
      { wrapper: TooltipProvider },
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onSelectSession).toHaveBeenCalledWith('session-42');
  });
});
