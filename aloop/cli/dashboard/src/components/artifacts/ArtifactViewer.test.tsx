import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ArtifactViewer, diffBadgeClass } from './ArtifactViewer';
import { type ManifestPayload, type LogEntry } from '@/lib/types';
import { LogEntryRow } from '../../AppView';

// Wrap with TooltipProvider for Tooltip to work in tests
import { TooltipProvider } from '@/components/ui/tooltip';

function wrap(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const makeManifest = (overrides: Partial<ManifestPayload> = {}): ManifestPayload => ({
  iteration: 3,
  phase: 'build',
  summary: 'Test summary',
  artifacts: [],
  ...overrides,
});

const imageArtifact = {
  type: 'screenshot',
  path: 'screenshot.png',
  description: 'A screenshot',
  metadata: undefined as ManifestPayload['artifacts'][0]['metadata'],
};

const textArtifact = {
  type: 'log',
  path: 'output.json',
  description: 'JSON output',
  metadata: undefined as ManifestPayload['artifacts'][0]['metadata'],
};

// ── 1. Image artifact renders <img> with correct src ──────────────────────────

describe('ArtifactViewer', () => {
  it('renders <img> for image artifact with correct src', () => {
    const manifest = makeManifest({ artifacts: [imageArtifact] });
    wrap(
      <ArtifactViewer
        manifest={manifest}
        allManifests={[manifest]}
        onLightbox={vi.fn()}
        onComparison={vi.fn()}
      />,
    );
    const img = screen.getByRole('img', { name: /screenshot\.png/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/api/artifacts/3/screenshot.png');
  });

  // ── 2. Diff badge color classes ────────────────────────────────────────────

  it('diffBadgeClass returns green for < 5%', () => {
    expect(diffBadgeClass(0)).toContain('green');
    expect(diffBadgeClass(4.9)).toContain('green');
  });

  it('diffBadgeClass returns yellow for 5–20%', () => {
    expect(diffBadgeClass(5)).toContain('yellow');
    expect(diffBadgeClass(19.9)).toContain('yellow');
  });

  it('diffBadgeClass returns red for >= 20%', () => {
    expect(diffBadgeClass(20)).toContain('red');
    expect(diffBadgeClass(100)).toContain('red');
  });

  it('renders diff badge on image thumbnail', () => {
    const artifact = { ...imageArtifact, metadata: { diff_percentage: 25 } };
    const manifest = makeManifest({ artifacts: [artifact] });
    wrap(
      <ArtifactViewer
        manifest={manifest}
        allManifests={[manifest]}
        onLightbox={vi.fn()}
        onComparison={vi.fn()}
      />,
    );
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  // ── 3. Non-image artifact renders <pre> ────────────────────────────────────

  it('renders <pre> block for non-image artifact with fetched content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('{"key":"value"}'),
    } as unknown as Response);

    const manifest = makeManifest({ artifacts: [textArtifact] });
    wrap(
      <ArtifactViewer
        manifest={manifest}
        allManifests={[manifest]}
        onLightbox={vi.fn()}
        onComparison={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('{"key":"value"}')).toBeInTheDocument();
    });
    const pre = screen.getByText('{"key":"value"}').closest('pre');
    expect(pre).toBeInTheDocument();
  });

  // ── 4. Click image (no baseline) calls onLightbox ──────────────────────────

  it('calls onLightbox when clicking image with no baseline', () => {
    const onLightbox = vi.fn();
    const manifest = makeManifest({ artifacts: [imageArtifact] });
    wrap(
      <ArtifactViewer
        manifest={manifest}
        allManifests={[manifest]}
        onLightbox={onLightbox}
        onComparison={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onLightbox).toHaveBeenCalledWith('/api/artifacts/3/screenshot.png');
  });

  // ── 5. Click image (with baseline) calls onComparison ─────────────────────

  it('calls onComparison when clicking image that has baseline iterations', () => {
    const onComparison = vi.fn();
    // allManifests has the same artifact path at an older iteration
    const baselineManifest = makeManifest({
      iteration: 1,
      artifacts: [{ ...imageArtifact, metadata: undefined }],
    });
    const manifest = makeManifest({ artifacts: [imageArtifact] });
    wrap(
      <ArtifactViewer
        manifest={manifest}
        allManifests={[baselineManifest, manifest]}
        onLightbox={vi.fn()}
        onComparison={onComparison}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onComparison).toHaveBeenCalledWith(imageArtifact, 3);
  });
});

// ── 6. Collapsed row shows artifact count indicator ───────────────────────────

describe('LogEntryRow collapsed artifact count indicator', () => {
  const makeEntry = (): LogEntry => ({
    timestamp: '2026-01-01T00:00:00Z',
    phase: 'build',
    event: 'iteration_complete',
    provider: '',
    model: '',
    duration: '',
    message: '',
    raw: '{}',
    rawObj: null,
    iteration: 3,
    dateKey: '2026-01-01',
    isSuccess: true,
    isError: false,
    commitHash: '',
    resultDetail: '',
    filesChanged: [],
    isSignificant: true,
  });

  it('shows artifact count indicator (e.g. "2A") in collapsed row when artifacts present', () => {
    const manifest = makeManifest({
      artifacts: [imageArtifact, textArtifact],
    });
    wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={manifest}
        isCurrentIteration={false}
        allManifests={[manifest]}
      />,
    );
    expect(screen.getByText('2A')).toBeInTheDocument();
  });

  it('does not show count indicator when no artifacts', () => {
    const manifest = makeManifest({ artifacts: [] });
    wrap(
      <LogEntryRow
        entry={makeEntry()}
        artifacts={manifest}
        isCurrentIteration={false}
        allManifests={[manifest]}
      />,
    );
    expect(screen.queryByText(/\dA/)).not.toBeInTheDocument();
  });
});
