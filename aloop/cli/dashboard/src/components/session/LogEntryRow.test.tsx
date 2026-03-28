import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { parseLogLine } from '@/lib/activityLogHelpers';
import type { ArtifactEntry, LogEntry, ManifestPayload } from '@/lib/types';
import { LogEntryRow } from './LogEntryRow';

vi.mock('./ImageLightbox', () => ({
  ImageLightbox: ({ src, onClose }: { src: string; onClose: () => void }) => (
    <div data-testid="image-lightbox" data-src={src} onClick={onClose}>ImageLightbox</div>
  ),
}));

vi.mock('./LogEntryExpandedDetails', () => ({
  LogEntryExpandedDetails: ({
    onLightbox,
    onComparison,
    showComparison,
    onCloseComparison,
  }: {
    onLightbox: (src: string) => void;
    onComparison: (artifact: ArtifactEntry, iteration: number) => void;
    showComparison: { artifact: ArtifactEntry; iteration: number } | null;
    onCloseComparison: () => void;
  }) => (
    <div data-testid="log-entry-expanded-details">
      <button data-testid="trigger-lightbox" onClick={() => onLightbox('test-image.png')}>
        Open Lightbox
      </button>
      <button data-testid="trigger-comparison" onClick={() => onComparison({ type: 'screenshot', path: 'test.png', description: 'test' }, 1)}>
        Open Comparison
      </button>
      {showComparison && (
        <button data-testid="close-comparison" onClick={onCloseComparison}>
          Close Comparison
        </button>
      )}
    </div>
  ),
}));

function parseEntry(json: Record<string, unknown>): LogEntry {
  return parseLogLine(JSON.stringify(json)) as LogEntry;
}

function renderRow(overrides: Partial<React.ComponentProps<typeof LogEntryRow>> = {}) {
  const defaultEntry = parseEntry({
    timestamp: new Date().toISOString(),
    event: 'iteration_complete',
    iteration: 1,
    phase: 'build',
    provider: 'claude',
    files: [{ path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 }],
  });

  const defaults: React.ComponentProps<typeof LogEntryRow> = {
    entry: defaultEntry,
    artifacts: null,
    allManifests: [],
  };

  return render(
    <TooltipProvider>
      <LogEntryRow {...defaults} {...overrides} />
    </TooltipProvider>,
  );
}

describe('LogEntryRow', () => {
  it('does not render expanded details when not expanded', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
    });
    renderRow({ entry });
    expect(screen.queryByTestId('log-entry-expanded-details')).not.toBeInTheDocument();
  });

  it('does not render ImageLightbox when lightboxSrc is null', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
    });
    renderRow({ entry });
    expect(screen.queryByTestId('image-lightbox')).not.toBeInTheDocument();
  });

  it('renders with artifacts count indicator when collapsed', () => {
    const artifact: ArtifactEntry = {
      type: 'screenshot',
      path: 'dashboard.png',
      description: 'Main view',
    };
    const artifacts: ManifestPayload = {
      iteration: 1,
      phase: 'proof',
      summary: '',
      artifacts: [artifact],
    };
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
    });
    renderRow({ entry, artifacts });
    expect(screen.getByText(/1A/)).toBeInTheDocument();
  });

  it('renders provider and model label', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
    });
    renderRow({ entry });
    expect(screen.getByText(/claude/)).toBeInTheDocument();
  });

  it('renders expanded details when clicked', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 }],
    });
    renderRow({ entry });
    
    const chevron = document.body.querySelector('[class*="chevron"]') as HTMLElement;
    fireEvent.click(chevron);
    
    expect(screen.getByTestId('log-entry-expanded-details')).toBeInTheDocument();
  });

  it('triggers onComparison callback and shows comparison when callback invoked', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 }],
    });
    renderRow({ entry });
    
    const chevron = document.body.querySelector('[class*="chevron"]') as HTMLElement;
    fireEvent.click(chevron);
    
    const triggerComparison = screen.getByTestId('trigger-comparison');
    fireEvent.click(triggerComparison);

    expect(screen.getByTestId('log-entry-expanded-details')).toBeInTheDocument();
    expect(screen.getByTestId('close-comparison')).toBeInTheDocument();
  });

  it('triggers onCloseComparison callback when close button clicked', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 }],
    });
    renderRow({ entry });
    
    const chevron = document.body.querySelector('[class*="chevron"]') as HTMLElement;
    fireEvent.click(chevron);
    
    const triggerComparison = screen.getByTestId('trigger-comparison');
    fireEvent.click(triggerComparison);
    
    const closeComparison = screen.getByTestId('close-comparison');
    fireEvent.click(closeComparison);

    expect(screen.queryByTestId('close-comparison')).not.toBeInTheDocument();
  });

  it('triggers onLightbox callback and shows ImageLightbox', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 }],
    });
    renderRow({ entry });
    
    const chevron = document.body.querySelector('[class*="chevron"]') as HTMLElement;
    fireEvent.click(chevron);
    
    const triggerLightbox = screen.getByTestId('trigger-lightbox');
    fireEvent.click(triggerLightbox);
    
    expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
  });

  it('closes ImageLightbox when onClose is triggered', () => {
    const entry = parseEntry({
      timestamp: new Date().toISOString(),
      event: 'iteration_complete',
      iteration: 1,
      phase: 'build',
      provider: 'claude',
      files: [{ path: 'src/foo.ts', status: 'M', additions: 5, deletions: 2 }],
    });
    renderRow({ entry });
    
    const chevron = document.body.querySelector('[class*="chevron"]') as HTMLElement;
    fireEvent.click(chevron);
    
    const triggerLightbox = screen.getByTestId('trigger-lightbox');
    fireEvent.click(triggerLightbox);
    
    const lightbox = screen.getByTestId('image-lightbox');
    fireEvent.click(lightbox);
    
    expect(screen.queryByTestId('image-lightbox')).not.toBeInTheDocument();
  });
});