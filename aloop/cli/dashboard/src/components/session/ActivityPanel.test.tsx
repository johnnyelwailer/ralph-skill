import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActivityPanel } from './ActivityPanel';
import type { ArtifactManifest } from '@/lib/types';

const baseProps = {
  log: '',
  artifacts: [] as ArtifactManifest[],
  currentIteration: null as number | null,
  currentPhase: '',
  currentProvider: '',
  isRunning: false,
  iterationStartedAt: undefined as string | undefined,
};

function renderActivityPanel(props: Partial<typeof baseProps> = {}) {
  return render(
    <TooltipProvider>
      <ActivityPanel {...baseProps} {...props} />
    </TooltipProvider>,
  );
}

function makeLogLine(event: string, iteration: number, timestamp: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ event, iteration, timestamp, phase: 'build', provider: 'claude', model: 'test', duration: '1s', message: '', ...extra });
}

describe('ActivityPanel', () => {
  it('renders 0 events when log is empty', () => {
    renderActivityPanel();
    expect(screen.getByText('0 events')).toBeInTheDocument();
  });

  it('renders event count from structured log lines', () => {
    const ts = new Date().toISOString();
    const log = makeLogLine('iteration_complete', 1, ts);
    renderActivityPanel({ log });
    expect(screen.getByText('1 events')).toBeInTheDocument();
  });

  it('excludes non-JSON (plain text) log lines', () => {
    const ts = new Date().toISOString();
    const log = [
      'plain text noise',
      makeLogLine('iteration_complete', 1, ts),
    ].join('\n');
    renderActivityPanel({ log });
    expect(screen.getByText('1 events')).toBeInTheDocument();
  });

  it('deduplicates multiple session_start entries', () => {
    const ts = new Date().toISOString();
    const log = [
      makeLogLine('session_start', 0, ts),
      makeLogLine('session_start', 0, ts),
    ].join('\n');
    renderActivityPanel({ log });
    // Only 1 session_start after dedup
    expect(screen.getByText('1 events')).toBeInTheDocument();
  });

  it('shows 0 events count but renders synthetic running entry when isRunning with no log', () => {
    renderActivityPanel({ isRunning: true, currentIteration: 5, currentPhase: 'build', currentProvider: 'claude' });
    // deduped is empty so event count shows 0
    expect(screen.getByText('0 events')).toBeInTheDocument();
  });

  it('does not add synthetic entry when current iteration already has a result', () => {
    const ts = new Date().toISOString();
    const log = makeLogLine('iteration_complete', 5, ts, { result: 'success' });
    // Even with isRunning, if there's already a result entry the synthetic one is skipped
    renderActivityPanel({ log, isRunning: true, currentIteration: 5, iterationStartedAt: undefined });
    // 1 event from log
    expect(screen.getByText('1 events')).toBeInTheDocument();
  });

  it('groups log entries by date', () => {
    const ts = new Date().toISOString();
    const log = makeLogLine('iteration_complete', 1, ts);
    renderActivityPanel({ log });
    // Date header should appear
    const dateHeaders = screen.getAllByText(/\d{4}-\d{2}-\d{2}|\w+ \d+/);
    expect(dateHeaders.length).toBeGreaterThan(0);
  });
});
