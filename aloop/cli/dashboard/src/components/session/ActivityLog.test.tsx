import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActivityPanel } from './ActivityPanel';
import { LogEntryRow } from './LogEntryRow';
import type { ArtifactManifest, LogEntry, ManifestPayload } from '@/lib/types';
import { parseLogLine } from '@/lib/activityLogHelpers';

function parseEntry(json: Record<string, unknown>): LogEntry {
  return parseLogLine(JSON.stringify(json)) as LogEntry;
}

function generateTimestamp(offsetSeconds: number): string {
  const date = new Date();
  date.setSeconds(date.getSeconds() + offsetSeconds);
  return date.toISOString();
}

const baseProps = {
  artifacts: [] as ArtifactManifest[],
  currentIteration: null as number | null,
  currentPhase: '',
  currentProvider: '',
  isRunning: false,
  iterationStartedAt: undefined as string | undefined,
};

function renderActivityPanel(
  log: string,
  overrides: Partial<typeof baseProps> = {},
) {
  return render(
    <TooltipProvider>
      <ActivityPanel log={log} {...baseProps} {...overrides} />
    </TooltipProvider>,
  );
}

function renderLogEntryRow(
  entry: LogEntry,
  overrides: {
    artifacts?: ManifestPayload | null;
    allManifests?: ManifestPayload[];
  } = {},
) {
  return render(
    <TooltipProvider>
      <LogEntryRow
        entry={entry}
        artifacts={overrides.artifacts ?? null}
        allManifests={overrides.allManifests ?? []}
      />
    </TooltipProvider>,
  );
}

describe('ActivityPanel', () => {
  describe('deduped memo - deduplicates multiple session_start entries', () => {
    it('keeps only first session_start entry when multiple exist', () => {
      const ts1 = generateTimestamp(0);
      const ts2 = generateTimestamp(10);
      const ts3 = generateTimestamp(20);

      const log = [
        { timestamp: ts1, event: 'session_start', iteration: null },
        { timestamp: ts2, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' },
        { timestamp: ts3, event: 'session_start', iteration: null },
      ]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log);
      expect(screen.getByText(/2 events/)).toBeInTheDocument();
    });

    it('keeps all entries when no session_start exists', () => {
      const ts1 = generateTimestamp(0);
      const ts2 = generateTimestamp(10);

      const log = [
        { timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' },
        { timestamp: ts2, event: 'iteration_complete', iteration: 2, phase: 'build', provider: 'claude' },
      ]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log);
      expect(screen.getByText(/2 events/)).toBeInTheDocument();
    });
  });

  describe('withCurrent memo - synthetic running entry', () => {
    it('does NOT add synthetic entry when isRunning=false', () => {
      const ts1 = generateTimestamp(0);
      const log = [{ timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' }]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log, { isRunning: false, currentIteration: null });
      expect(screen.getByText(/1 events/)).toBeInTheDocument();
    });

    it('does NOT add synthetic entry when isRunning=true but no currentIteration', () => {
      const ts1 = generateTimestamp(0);
      const log = [{ timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' }]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log, { isRunning: true, currentIteration: null });
      expect(screen.getByText(/1 events/)).toBeInTheDocument();
    });

    it('adds synthetic running entry (shows Loader2 spinner) when isRunning=true and currentIteration has no result', () => {
      const ts1 = generateTimestamp(0);
      const log = [{ timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' }]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log, { isRunning: true, currentIteration: 2, currentPhase: 'build', currentProvider: 'claude' });
      const loader = document.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    });
  });

  describe('hasResult - suppresses synthetic running entry when result exists', () => {
    it('suppresses synthetic entry when iteration already has success result', () => {
      const ts1 = generateTimestamp(0);
      const ts2 = generateTimestamp(10);
      const log = [
        { timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' },
        { timestamp: ts2, event: 'iteration_complete', iteration: 2, phase: 'build', provider: 'claude' },
      ]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log, { isRunning: true, currentIteration: 2, currentPhase: 'build', currentProvider: 'claude' });
      expect(screen.getByText(/2 events/)).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('suppresses synthetic entry when iteration has error result', () => {
      const ts1 = generateTimestamp(0);
      const ts2 = generateTimestamp(10);
      const log = [
        { timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' },
        { timestamp: ts2, event: 'iteration_error', iteration: 2, phase: 'build', provider: 'claude', resultDetail: 'failed' },
      ]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log, { isRunning: true, currentIteration: 2, currentPhase: 'build', currentProvider: 'claude' });
      expect(screen.getByText(/2 events/)).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('does NOT suppress synthetic entry when result timestamp < iterationStartedAt', () => {
      const ts1 = generateTimestamp(0);
      const ts2 = generateTimestamp(100);
      const ts3 = generateTimestamp(200);
      const log = [
        { timestamp: ts1, event: 'iteration_complete', iteration: 1, phase: 'build', provider: 'claude' },
        { timestamp: ts2, event: 'iteration_complete', iteration: 2, phase: 'build', provider: 'claude' },
      ]
        .map((j) => JSON.stringify(j))
        .join('\n');

      renderActivityPanel(log, {
        isRunning: true,
        currentIteration: 2,
        currentPhase: 'build',
        currentProvider: 'claude',
        iterationStartedAt: ts3,
      });
      expect(screen.getByText(/2 events/)).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });
});

describe('LogEntryRow loadOutput', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches output on expand when fetch succeeds and has expandable content', async () => {
    const entry = parseEntry({
      timestamp: generateTimestamp(0),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/index.ts', status: 'M', additions: 10, deletions: 2 }],
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Build output text here'),
    } as Response);

    renderLogEntryRow(entry);
    const row = screen.getByText(/build/).closest('div');
    if (row) {
      await act(async () => {
        row.click();
      });
    }

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/artifacts/1/output.txt');
    });
  });

  it('displays "No output available" when fetch returns non-ok status', async () => {
    const entry = parseEntry({
      timestamp: generateTimestamp(0),
      event: 'iteration_complete',
      iteration: 2,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/index.ts', status: 'M', additions: 10, deletions: 2 }],
    });

    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    renderLogEntryRow(entry);
    const row = screen.getByText(/build/).closest('div');
    if (row) {
      await act(async () => {
        row.click();
      });
    }

    await waitFor(() => {
      expect(screen.getByText(/No output available/)).toBeInTheDocument();
    });
  });

  it('displays "No output available" when fetch throws network error', async () => {
    const entry = parseEntry({
      timestamp: generateTimestamp(0),
      event: 'iteration_complete',
      iteration: 3,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/index.ts', status: 'M', additions: 10, deletions: 2 }],
    });

    fetchSpy.mockRejectedValue(new TypeError('Network error'));

    renderLogEntryRow(entry);
    const row = screen.getByText(/build/).closest('div');
    if (row) {
      await act(async () => {
        row.click();
      });
    }

    await waitFor(() => {
      expect(screen.getByText(/No output available/)).toBeInTheDocument();
    });
  });

  it('does not fetch output when entry has no iteration number', async () => {
    const entry = parseEntry({
      timestamp: generateTimestamp(0),
      event: 'session_start',
      iteration: null,
    });

    renderLogEntryRow(entry);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});