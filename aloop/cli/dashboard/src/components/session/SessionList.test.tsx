import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SessionList, type SessionListSession } from '@/components/session/SessionList';
import { TooltipProvider } from '@/components/ui/tooltip';

const mkSession = (overrides: Partial<SessionListSession> = {}): SessionListSession => ({
  id: 'session-1',
  name: 'Session One',
  status: 'stopped',
  phase: 'build',
  iterations: '1',
  isActive: false,
  branch: 'feature/abc',
  startedAt: '2026-03-22T08:00:00.000Z',
  endedAt: '2026-03-22T08:30:00.000Z',
  pid: '1234',
  provider: 'claude',
  workDir: '/tmp/work',
  stuckCount: 0,
  projectName: 'Project A',
  ...overrides,
});

describe('SessionList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty state with no sessions', () => {
    render(<SessionList sessions={[]} selectedSessionId={null} onSelectSession={vi.fn()} />, {
      wrapper: TooltipProvider,
    });
    expect(screen.getByText('No sessions.')).toBeInTheDocument();
  });

  it('selects first session when selectedSessionId is null', () => {
    const sessions = [
      mkSession({ id: 'first', name: 'First Session', isActive: true, status: 'running', endedAt: '' }),
      mkSession({ id: 'second', name: 'Second Session', projectName: 'Project B' }),
    ];

    const { container } = render(
      <SessionList sessions={sessions} selectedSessionId={null} onSelectSession={vi.fn()} />,
      { wrapper: TooltipProvider },
    );

    const buttons = container.querySelectorAll('button[type="button"]');
    const sessionButtons = Array.from(buttons).filter((btn) =>
      btn.textContent?.includes('Session'),
    );

    expect(sessionButtons).toHaveLength(2);
    expect(sessionButtons[0]).toHaveClass('bg-accent');
    expect(sessionButtons[1]).not.toHaveClass('bg-accent');
  });

  it('splits active/recent vs older sessions using 24h cutoff', () => {
    const sessions = [
      mkSession({ id: 'active', name: 'Active Session', isActive: true, status: 'running', endedAt: '' }),
      mkSession({ id: 'recent', name: 'Recent Session', endedAt: '2026-03-22T10:30:00.000Z' }),
      mkSession({ id: 'old', name: 'Old Session', endedAt: '2026-03-20T06:00:00.000Z', projectName: 'Project Z' }),
    ];

    render(<SessionList sessions={sessions} selectedSessionId={null} onSelectSession={vi.fn()} />, {
      wrapper: TooltipProvider,
    });

    expect(screen.getByText('Project A')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Older')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    expect(screen.queryByText('Old Session')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Older'));
    expect(screen.getByText('Old Session')).toBeInTheDocument();
  });

  it('filters sessions by name', () => {
    const sessions = [
      mkSession({ id: 's1', name: 'Alpha Session', isActive: true, status: 'running', endedAt: '' }),
      mkSession({ id: 's2', name: 'Beta Session', isActive: true, status: 'running', endedAt: '' }),
    ];

    render(<SessionList sessions={sessions} selectedSessionId={null} onSelectSession={vi.fn()} />, {
      wrapper: TooltipProvider,
    });

    const input = screen.getByPlaceholderText('Filter sessions…');
    expect(screen.getByText('Alpha Session')).toBeInTheDocument();
    expect(screen.getByText('Beta Session')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'alpha' } });
    expect(screen.getByText('Alpha Session')).toBeInTheDocument();
    expect(screen.queryByText('Beta Session')).not.toBeInTheDocument();
  });

  it('shows empty filter message when no sessions match', () => {
    const sessions = [
      mkSession({ id: 's1', name: 'Alpha Session', isActive: true, status: 'running', endedAt: '' }),
    ];

    render(<SessionList sessions={sessions} selectedSessionId={null} onSelectSession={vi.fn()} />, {
      wrapper: TooltipProvider,
    });

    fireEvent.change(screen.getByPlaceholderText('Filter sessions…'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching sessions.')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Session')).not.toBeInTheDocument();
  });

  it('filters by branch name', () => {
    const sessions = [
      mkSession({ id: 's1', name: 'Session A', branch: 'feat/login', isActive: true, status: 'running', endedAt: '' }),
      mkSession({ id: 's2', name: 'Session B', branch: 'fix/crash', isActive: true, status: 'running', endedAt: '' }),
    ];

    render(<SessionList sessions={sessions} selectedSessionId={null} onSelectSession={vi.fn()} />, {
      wrapper: TooltipProvider,
    });

    fireEvent.change(screen.getByPlaceholderText('Filter sessions…'), { target: { value: 'login' } });
    expect(screen.getByText('Session A')).toBeInTheDocument();
    expect(screen.queryByText('Session B')).not.toBeInTheDocument();
  });
});
