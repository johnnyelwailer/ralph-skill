import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SideBySideView } from './SideBySideView';

const defaultProps = {
  baselineSrc: '/baseline.png',
  currentSrc: '/current.png',
  selectedBaseline: 2,
  currentIteration: 5,
};

describe('SideBySideView', () => {
  it('renders baseline image with correct alt text', () => {
    render(<SideBySideView {...defaultProps} />);
    expect(screen.getByAltText('Baseline iter 2')).toBeInTheDocument();
  });

  it('renders current image with correct alt text', () => {
    render(<SideBySideView {...defaultProps} />);
    expect(screen.getByAltText('Current iter 5')).toBeInTheDocument();
  });

  it('renders baseline label with iteration number', () => {
    render(<SideBySideView {...defaultProps} />);
    expect(screen.getByText('Baseline (iter 2)')).toBeInTheDocument();
  });

  it('renders current label with iteration number', () => {
    render(<SideBySideView {...defaultProps} />);
    expect(screen.getByText('Current (iter 5)')).toBeInTheDocument();
  });

  it('renders baseline image src correctly', () => {
    render(<SideBySideView {...defaultProps} />);
    const img = screen.getByAltText('Baseline iter 2') as HTMLImageElement;
    expect(img.src).toContain('/baseline.png');
  });

  it('renders current image src correctly', () => {
    render(<SideBySideView {...defaultProps} />);
    const img = screen.getByAltText('Current iter 5') as HTMLImageElement;
    expect(img.src).toContain('/current.png');
  });
});
