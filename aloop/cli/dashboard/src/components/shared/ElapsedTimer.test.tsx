import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElapsedTimer } from './ElapsedTimer';

describe('ElapsedTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial elapsed time', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    vi.setSystemTime(now);
    const since = new Date('2024-01-01T00:04:50Z').toISOString();
    render(<ElapsedTimer since={since} />);
    expect(screen.getByText('10s')).toBeInTheDocument();
  });

  it('updates every second', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    vi.setSystemTime(now);
    const since = new Date('2024-01-01T00:04:50Z').toISOString();
    render(<ElapsedTimer since={since} />);
    expect(screen.getByText('10s')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('displays minutes and seconds', () => {
    const now = new Date('2024-01-01T00:05:30Z');
    vi.setSystemTime(now);
    const since = new Date('2024-01-01T00:04:00Z').toISOString();
    render(<ElapsedTimer since={since} />);
    expect(screen.getByText('1m 30s')).toBeInTheDocument();
  });

  it('displays minutes only when seconds are zero', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    vi.setSystemTime(now);
    const since = new Date('2024-01-01T00:02:00Z').toISOString();
    render(<ElapsedTimer since={since} />);
    expect(screen.getByText('3m')).toBeInTheDocument();
  });

  it('does not show negative time', () => {
    const now = new Date('2024-01-01T00:04:00Z');
    vi.setSystemTime(now);
    const since = new Date('2024-01-01T00:05:00Z').toISOString();
    render(<ElapsedTimer since={since} />);
    expect(screen.getByText('0s')).toBeInTheDocument();
  });

  it('clears interval on unmount', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    vi.setSystemTime(now);
    const since = new Date('2024-01-01T00:04:50Z').toISOString();
    const { unmount } = render(<ElapsedTimer since={since} />);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('resets when since prop changes', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    vi.setSystemTime(now);
    const since1 = new Date('2024-01-01T00:04:50Z').toISOString();
    const since2 = new Date('2024-01-01T00:04:40Z').toISOString();
    const { rerender } = render(<ElapsedTimer since={since1} />);
    expect(screen.getByText('10s')).toBeInTheDocument();

    rerender(<ElapsedTimer since={since2} />);
    expect(screen.getByText('20s')).toBeInTheDocument();
  });
});
