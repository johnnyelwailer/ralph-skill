import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhaseBadge } from './PhaseBadge';

describe('PhaseBadge', () => {
  it('renders the phase label', () => {
    render(<PhaseBadge phase="plan" />);
    expect(screen.getByText('plan')).toBeInTheDocument();
  });

  it('returns null when phase is empty', () => {
    const { container } = render(<PhaseBadge phase="" />);
    expect(container.firstChild).toBeNull();
  });

  it('applies phase-specific colors for known phases', () => {
    const { container: plan } = render(<PhaseBadge phase="plan" />);
    expect(plan.querySelector('.bg-purple-500\\/20')).toBeTruthy();

    const { container: build } = render(<PhaseBadge phase="build" />);
    expect(build.querySelector('.bg-yellow-500\\/20')).toBeTruthy();

    const { container: proof } = render(<PhaseBadge phase="proof" />);
    expect(proof.querySelector('.bg-amber-500\\/20')).toBeTruthy();

    const { container: review } = render(<PhaseBadge phase="review" />);
    expect(review.querySelector('.bg-cyan-500\\/20')).toBeTruthy();
  });

  it('applies fallback colors for unknown phases', () => {
    const { container } = render(<PhaseBadge phase="custom" />);
    expect(container.querySelector('.bg-muted')).toBeTruthy();
  });

  it('applies small size classes when small prop is true', () => {
    const { container } = render(<PhaseBadge phase="plan" small />);
    const span = container.querySelector('span');
    expect(span?.classList.contains('px-1')).toBe(true);
    expect(span?.classList.contains('py-0')).toBe(true);
    expect(span?.classList.contains('text-[10px]')).toBe(true);
  });

  it('applies default size classes when small is not set', () => {
    const { container } = render(<PhaseBadge phase="plan" />);
    const span = container.querySelector('span');
    expect(span?.classList.contains('px-1.5')).toBe(true);
    expect(span?.classList.contains('py-0.5')).toBe(true);
    expect(span?.classList.contains('text-xs')).toBe(true);
  });

  it('handles case-insensitive phase lookup', () => {
    const { container } = render(<PhaseBadge phase="PLAN" />);
    expect(container.querySelector('.bg-purple-500\\/20')).toBeTruthy();
    expect(screen.getByText('PLAN')).toBeInTheDocument();
  });
});
