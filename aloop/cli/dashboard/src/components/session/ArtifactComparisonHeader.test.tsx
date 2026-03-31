import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArtifactComparisonHeader } from './ArtifactComparisonHeader';
import type { ArtifactEntry } from '@/lib/types';
import type { ComparisonMode } from './ArtifactComparisonDialog';

const baseArtifact: ArtifactEntry = {
  type: 'screenshot',
  path: 'output/screenshot.png',
  description: 'test artifact',
};

const defaultProps = {
  artifact: baseArtifact,
  mode: 'side-by-side' as ComparisonMode,
  setMode: vi.fn(),
  hasBaseline: true,
  baselineIters: [1, 3, 5],
  selectedBaseline: 5,
  setSelectedBaseline: vi.fn(),
  onClose: vi.fn(),
};

function renderHeader(props: Partial<typeof defaultProps> = {}) {
  return render(<ArtifactComparisonHeader {...defaultProps} {...props} />);
}

describe('ArtifactComparisonHeader', () => {
  it('renders artifact path', () => {
    renderHeader();
    expect(screen.getByText('output/screenshot.png')).toBeInTheDocument();
  });

  it('shows diff percentage badge when metadata provides it', () => {
    const artifact: ArtifactEntry = { ...baseArtifact, metadata: { diff_percentage: 3.5 } };
    renderHeader({ artifact });
    expect(screen.getByText('diff: 3.5%')).toBeInTheDocument();
  });

  it('does not show diff badge when metadata is absent', () => {
    renderHeader({ artifact: baseArtifact });
    expect(screen.queryByText(/diff:/)).not.toBeInTheDocument();
  });

  it('renders mode tabs when hasBaseline is true', () => {
    renderHeader({ hasBaseline: true });
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByText('Side by Side')).toBeInTheDocument();
    expect(screen.getByText('Slider')).toBeInTheDocument();
    expect(screen.getByText('Diff Overlay')).toBeInTheDocument();
  });

  it('does not render mode tabs when hasBaseline is false', () => {
    renderHeader({ hasBaseline: false });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('marks the active mode tab as selected', () => {
    renderHeader({ mode: 'slider' });
    const sliderTab = screen.getByText('Slider');
    expect(sliderTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Side by Side')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls setMode when a mode tab is clicked', () => {
    const setMode = vi.fn();
    renderHeader({ setMode });
    fireEvent.click(screen.getByText('Diff Overlay'));
    expect(setMode).toHaveBeenCalledWith('diff-overlay');
  });

  it('renders baseline iteration select with options', () => {
    renderHeader({ baselineIters: [1, 3, 5] });
    const select = screen.getByLabelText('Compare against iteration');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('iter 1 (baseline)')).toBeInTheDocument();
    expect(screen.getByText('iter 5 (initial)')).toBeInTheDocument();
  });

  it('calls setSelectedBaseline when select changes', () => {
    const setSelectedBaseline = vi.fn();
    renderHeader({ setSelectedBaseline });
    const select = screen.getByLabelText('Compare against iteration');
    fireEvent.change(select, { target: { value: '3' } });
    expect(setSelectedBaseline).toHaveBeenCalledWith(3);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderHeader({ onClose });
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
