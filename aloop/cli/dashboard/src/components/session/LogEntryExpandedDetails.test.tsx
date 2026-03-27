import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { parseLogLine } from '@/lib/activityLogHelpers';
import type { ArtifactEntry, LogEntry, ManifestPayload } from '@/lib/types';
import { LogEntryExpandedDetails } from './LogEntryExpandedDetails';

vi.mock('./ArtifactComparisonDialog', () => ({
  ArtifactComparisonDialog: () => <div data-testid="artifact-comparison-dialog" />,
}));

vi.mock('@/components/artifacts/ArtifactViewer', () => ({
  ArtifactViewer: () => <div data-testid="artifact-viewer" />,
}));

function parseEntry(json: Record<string, unknown>): LogEntry {
  return parseLogLine(JSON.stringify(json)) as LogEntry;
}

const noopRef = { current: null } as React.RefObject<HTMLDivElement>;

function renderDetails(overrides: Partial<React.ComponentProps<typeof LogEntryExpandedDetails>>) {
  const defaultEntry = parseEntry({
    timestamp: new Date().toISOString(),
    event: 'iteration_complete',
    iteration: 1,
    phase: 'build',
    provider: 'claude',
  });

  const defaults: React.ComponentProps<typeof LogEntryExpandedDetails> = {
    entry: defaultEntry,
    artifacts: null,
    allManifests: [],
    hasOutput: false,
    outputLoading: false,
    outputText: null,
    outputRef: noopRef,
    onLightbox: vi.fn(),
    onComparison: vi.fn(),
    showComparison: null,
    onCloseComparison: vi.fn(),
  };

  return render(
    <TooltipProvider>
      <LogEntryExpandedDetails {...defaults} {...overrides} />
    </TooltipProvider>,
  );
}

describe('LogEntryExpandedDetails', () => {
  it('renders file path list when filesChanged.length > 0', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [
        { path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 },
        { path: 'src/bar.ts', status: 'A', additions: 10, deletions: 0 },
      ],
    });
    renderDetails({ entry });
    expect(screen.getByText(/src\/foo\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/src\/bar\.ts/)).toBeInTheDocument();
  });

  it('renders token/cost row with $ amount when extractIterationUsage returns non-null', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      tokens_input: 1000,
      tokens_output: 500,
      tokens_cache_read: 0,
      cost_usd: 0.0042,
    });
    renderDetails({ entry });
    expect(screen.getByText(/\$0\.0042/)).toBeInTheDocument();
  });

  it('does not render token/cost row when no cost data', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
    });
    renderDetails({ entry });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('renders event detail section when entry.isError is true', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_error',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      reason: 'something went wrong',
    });
    expect(entry.isError).toBe(true);
    renderDetails({ entry });
    // The event detail section renders key:value pairs from rawObj (excluding filtered keys)
    expect(screen.getByText(/reason:/)).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/)).toBeInTheDocument();
  });

  it('renders ArtifactComparisonDialog when showComparison is non-null', () => {
    const artifact: ArtifactEntry = {
      type: 'screenshot',
      path: 'dashboard.png',
      description: 'Main view',
    };
    const allManifests: ManifestPayload[] = [
      { iteration: 1, phase: 'proof', summary: '', artifacts: [artifact] },
    ];
    renderDetails({
      showComparison: { artifact, iteration: 1 },
      allManifests,
      onCloseComparison: vi.fn(),
    });
    expect(screen.getByTestId('artifact-comparison-dialog')).toBeInTheDocument();
  });

  it('does NOT render ArtifactComparisonDialog when showComparison is null', () => {
    renderDetails({ showComparison: null });
    expect(screen.queryByTestId('artifact-comparison-dialog')).not.toBeInTheDocument();
  });
});
