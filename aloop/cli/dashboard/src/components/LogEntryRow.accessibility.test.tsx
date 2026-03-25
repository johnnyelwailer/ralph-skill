import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LogEntryRow } from './LogEntryRow';
import type { ManifestPayload, LogEntry } from '../AppView';

function wrap(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: '2026-01-01T00:00:00Z',
  phase: 'build',
  event: 'iteration_complete',
  provider: 'claude',
  model: 'sonnet',
  duration: '45s',
  message: 'Build completed',
  raw: '{"event":"iteration_complete"}',
  rawObj: { event: 'iteration_complete', files_changed: ['src/foo.ts'] },
  iteration: 3,
  dateKey: '2026-01-01',
  isSuccess: true,
  isError: false,
  commitHash: 'abc1234',
  resultDetail: 'feat: add feature',
  filesChanged: [{ path: 'src/foo.ts', type: 'M', additions: 10, deletions: 2 }],
  isSignificant: true,
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('LogEntryRow accessibility', () => {
  it('renders as a button element', () => {
    wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={null}
        isCurrentIteration={false}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('has min-h-[44px] class for mobile tap target', () => {
    wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={null}
        isCurrentIteration={false}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('has md:min-h-0 class for desktop override', () => {
    wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={null}
        isCurrentIteration={false}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('md:min-h-0');
  });

  it('toggles expand on Enter key press', () => {
    const { container } = wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={null}
        isCurrentIteration={false}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();

    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(container.querySelector('.animate-fade-in')).toBeInTheDocument();

    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();
  });

  it('toggles expand on Space key press', () => {
    const { container } = wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={null}
        isCurrentIteration={false}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');

    fireEvent.keyDown(btn, { key: ' ' });
    expect(container.querySelector('.animate-fade-in')).toBeInTheDocument();

    fireEvent.keyDown(btn, { key: ' ' });
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();
  });

  it('does not expand on other key presses', () => {
    const { container } = wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={null}
        isCurrentIteration={false}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');

    fireEvent.keyDown(btn, { key: 'Tab' });
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();

    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();
  });

  it('does not expand for non-expandable entries (running)', () => {
    const { container } = wrap(
      <LogEntryRow
        entry={makeEntry({ event: 'iteration_running', isSuccess: false, rawObj: null, filesChanged: [] })}
        artifacts={null}
        isCurrentIteration={true}
        allManifests={[]}
      />,
    );
    const btn = screen.getByRole('button');

    fireEvent.click(btn);
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();

    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(container.querySelector('.animate-fade-in')).not.toBeInTheDocument();
  });
});
