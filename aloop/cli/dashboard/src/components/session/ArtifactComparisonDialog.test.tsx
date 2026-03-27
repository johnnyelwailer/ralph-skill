import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArtifactEntry, ManifestPayload } from '@/lib/types';
import { ArtifactComparisonHeader } from './ArtifactComparisonHeader';
import { SideBySideView } from './SideBySideView';
import { SliderView } from './SliderView';
import { DiffOverlayView } from './DiffOverlayView';
import { ArtifactComparisonDialog } from './ArtifactComparisonDialog';

const mockArtifact: ArtifactEntry = {
  type: 'screenshot',
  path: 'dashboard-main.png',
  description: 'Dashboard main view',
};

function makeArtifact(overrides: Partial<ArtifactEntry> = {}): ArtifactEntry {
  return { ...mockArtifact, ...overrides };
}

function makeManifests(currentIteration: number): ManifestPayload[] {
  return [
    {
      iteration: currentIteration - 2,
      phase: 'proof',
      summary: '',
      artifacts: [{ type: 'screenshot', path: 'dashboard-main.png', description: '', metadata: {} }],
    },
    {
      iteration: currentIteration - 1,
      phase: 'proof',
      summary: '',
      artifacts: [{ type: 'screenshot', path: 'dashboard-main.png', description: '', metadata: {} }],
    },
    {
      iteration: currentIteration,
      phase: 'proof',
      summary: '',
      artifacts: [{ type: 'screenshot', path: 'dashboard-main.png', description: '', metadata: {} }],
    },
  ];
}

describe('ArtifactComparisonHeader', () => {
  describe('diff_percentage badge', () => {
    it('renders green class when diff_percentage < 5', () => {
      const artifact = makeArtifact({ metadata: { diff_percentage: 2.3 } });
      render(
        <ArtifactComparisonHeader
          artifact={artifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const badge = screen.getByText(/diff: 2.3%/);
      expect(badge.className).toContain('green');
    });

    it('renders yellow class when diff_percentage between 5 and 20', () => {
      const artifact = makeArtifact({ metadata: { diff_percentage: 12.0 } });
      render(
        <ArtifactComparisonHeader
          artifact={artifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const badge = screen.getByText(/diff: 12.0%/);
      expect(badge.className).toContain('yellow');
    });

    it('renders red class when diff_percentage >= 20', () => {
      const artifact = makeArtifact({ metadata: { diff_percentage: 25.0 } });
      render(
        <ArtifactComparisonHeader
          artifact={artifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const badge = screen.getByText(/diff: 25.0%/);
      expect(badge.className).toContain('red');
    });

    it('does not render badge when diff_percentage is undefined', () => {
      const artifact = makeArtifact();
      render(
        <ArtifactComparisonHeader
          artifact={artifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.queryByText(/diff:/)).not.toBeInTheDocument();
    });
  });

  describe('mode tabs', () => {
    it('calls setMode with "slider" when Slider tab clicked', async () => {
      const setMode = vi.fn();
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="side-by-side"
          setMode={setMode}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /slider/i }));
      expect(setMode).toHaveBeenCalledWith('slider');
    });

    it('calls setMode with "diff-overlay" when Diff Overlay tab clicked', () => {
      const setMode = vi.fn();
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="side-by-side"
          setMode={setMode}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('tab', { name: /diff overlay/i }));
      expect(setMode).toHaveBeenCalledWith('diff-overlay');
    });

    it('marks active tab with aria-selected=true', () => {
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="slider"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByRole('tab', { name: /slider/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: /side by side/i })).toHaveAttribute('aria-selected', 'false');
    });

    it('does not render tabs when hasBaseline is false', () => {
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={false}
          baselineIters={[]}
          selectedBaseline={null}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  describe('baseline dropdown', () => {
    it('calls setSelectedBaseline with number on change', () => {
      const setSelectedBaseline = vi.fn();
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[3, 2, 1]}
          selectedBaseline={3}
          setSelectedBaseline={setSelectedBaseline}
          onClose={vi.fn()}
        />,
      );
      const select = screen.getByLabelText(/compare against iteration/i);
      fireEvent.change(select, { target: { value: '1' } });
      expect(setSelectedBaseline).toHaveBeenCalledWith(1);
    });

    it('does not render dropdown when baselineIters is empty', () => {
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={false}
          baselineIters={[]}
          selectedBaseline={null}
          setSelectedBaseline={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.queryByLabelText(/compare against iteration/i)).not.toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <ArtifactComparisonHeader
          artifact={mockArtifact}
          mode="side-by-side"
          setMode={vi.fn()}
          hasBaseline={true}
          baselineIters={[1]}
          selectedBaseline={1}
          setSelectedBaseline={vi.fn()}
          onClose={onClose}
        />,
      );
      fireEvent.click(screen.getByText('×'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('SideBySideView', () => {
  it('renders both baseline and current images', () => {
    render(
      <SideBySideView
        baselineSrc="/api/artifacts/1/dashboard-main.png"
        currentSrc="/api/artifacts/3/dashboard-main.png"
        selectedBaseline={1}
        currentIteration={3}
      />,
    );
    expect(screen.getByAltText('Baseline iter 1')).toBeInTheDocument();
    expect(screen.getByAltText('Current iter 3')).toBeInTheDocument();
  });

  it('renders iteration labels', () => {
    render(
      <SideBySideView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
      />,
    );
    expect(screen.getByText('Baseline (iter 1)')).toBeInTheDocument();
    expect(screen.getByText('Current (iter 3)')).toBeInTheDocument();
  });
});

describe('SliderView', () => {
  it('renders slider with correct aria attributes', () => {
    render(
      <SliderView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
        sliderPos={50}
        setSliderPos={vi.fn()}
      />,
    );
    const slider = screen.getByRole('slider', { name: /image comparison slider/i });
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
  });

  it('ArrowLeft key decrements sliderPos by 2', () => {
    const setSliderPos = vi.fn();
    render(
      <SliderView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
        sliderPos={50}
        setSliderPos={setSliderPos}
      />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(setSliderPos).toHaveBeenCalledTimes(1);
    const updater = setSliderPos.mock.calls[0][0];
    expect(updater(50)).toBe(48);
  });

  it('ArrowRight key increments sliderPos by 2', () => {
    const setSliderPos = vi.fn();
    render(
      <SliderView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
        sliderPos={50}
        setSliderPos={setSliderPos}
      />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(setSliderPos).toHaveBeenCalledTimes(1);
    const updater = setSliderPos.mock.calls[0][0];
    expect(updater(50)).toBe(52);
  });

  it('ArrowLeft clamps at 0', () => {
    const setSliderPos = vi.fn();
    render(
      <SliderView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
        sliderPos={1}
        setSliderPos={setSliderPos}
      />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    const updater = setSliderPos.mock.calls[0][0];
    expect(updater(1)).toBe(0);
  });

  it('ArrowRight clamps at 100', () => {
    const setSliderPos = vi.fn();
    render(
      <SliderView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
        sliderPos={99}
        setSliderPos={setSliderPos}
      />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    const updater = setSliderPos.mock.calls[0][0];
    expect(updater(99)).toBe(100);
  });
});

describe('DiffOverlayView', () => {
  it('renders baseline and current images', () => {
    render(
      <DiffOverlayView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
      />,
    );
    expect(screen.getByAltText('Baseline iter 1')).toBeInTheDocument();
    expect(screen.getByAltText('Current iter 3')).toBeInTheDocument();
  });

  it('renders opacity slider with default 50%', () => {
    render(
      <DiffOverlayView
        baselineSrc="/api/artifacts/1/img.png"
        currentSrc="/api/artifacts/3/img.png"
        selectedBaseline={1}
        currentIteration={3}
      />,
    );
    const slider = screen.getByLabelText(/overlay opacity/i);
    expect(slider).toHaveValue('50');
  });
});

describe('ArtifactComparisonDialog', () => {
  it('renders "No baseline — first capture" when no baselines exist', () => {
    render(
      <ArtifactComparisonDialog
        artifact={makeArtifact()}
        currentIteration={5}
        allManifests={[
          { iteration: 5, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard-main.png', description: '', metadata: {} }] },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no baseline — first capture/i)).toBeInTheDocument();
  });

  it('renders SideBySideView by default when baseline exists', () => {
    const manifests = makeManifests(5);
    render(
      <ArtifactComparisonDialog
        artifact={makeArtifact()}
        currentIteration={5}
        allManifests={manifests}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/baseline \(iter/i)).toBeInTheDocument();
    expect(screen.getByText(/current \(iter/i)).toBeInTheDocument();
  });

  it('switches to SliderView when Slider tab is clicked', () => {
    const manifests = makeManifests(5);
    render(
      <ArtifactComparisonDialog
        artifact={makeArtifact()}
        currentIteration={5}
        allManifests={manifests}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /slider/i }));
    expect(screen.getByRole('slider', { name: /image comparison slider/i })).toBeInTheDocument();
  });

  it('switches to DiffOverlayView when Diff Overlay tab is clicked', () => {
    const manifests = makeManifests(5);
    render(
      <ArtifactComparisonDialog
        artifact={makeArtifact()}
        currentIteration={5}
        allManifests={manifests}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /diff overlay/i }));
    expect(screen.getByLabelText(/overlay opacity/i)).toBeInTheDocument();
  });

  it('calls onClose on Escape keydown', () => {
    const onClose = vi.fn();
    const manifests = makeManifests(5);
    render(
      <ArtifactComparisonDialog
        artifact={makeArtifact()}
        currentIteration={5}
        allManifests={manifests}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('baseline dropdown changes selectedBaseline', () => {
    const manifests = makeManifests(5);
    render(
      <ArtifactComparisonDialog
        artifact={makeArtifact()}
        currentIteration={5}
        allManifests={manifests}
        onClose={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/compare against iteration/i);
    fireEvent.change(select, { target: { value: '3' } });
    expect(screen.getByText('Baseline (iter 3)')).toBeInTheDocument();
  });
});
