import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DiffOverlayView } from './DiffOverlayView';

const defaultProps = {
  baselineSrc: '/baseline.png',
  currentSrc: '/current.png',
  selectedBaseline: 2,
  currentIteration: 5,
};

describe('DiffOverlayView', () => {
  it('renders with aria-label for the comparison region', () => {
    render(<DiffOverlayView {...defaultProps} />);
    expect(screen.getByLabelText('Diff overlay comparison')).toBeInTheDocument();
  });

  it('renders baseline image with correct alt text', () => {
    render(<DiffOverlayView {...defaultProps} />);
    expect(screen.getByAltText('Baseline iter 2')).toBeInTheDocument();
  });

  it('renders current image with correct alt text', () => {
    render(<DiffOverlayView {...defaultProps} />);
    expect(screen.getByAltText('Current iter 5')).toBeInTheDocument();
  });

  it('shows default opacity of 50%', () => {
    render(<DiffOverlayView {...defaultProps} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('updates opacity display when slider is changed', () => {
    render(<DiffOverlayView {...defaultProps} />);
    const slider = screen.getByLabelText('Overlay opacity');
    fireEvent.change(slider, { target: { value: '75' } });
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('applies opacity style to current image', () => {
    render(<DiffOverlayView {...defaultProps} />);
    const currentImg = screen.getByAltText('Current iter 5');
    expect(currentImg).toHaveStyle({ opacity: '0.5' });
  });

  it('shows iteration labels in footer', () => {
    render(<DiffOverlayView {...defaultProps} />);
    expect(screen.getByText('Baseline (iter 2)')).toBeInTheDocument();
    expect(screen.getByText('Current (iter 5)')).toBeInTheDocument();
  });
});
