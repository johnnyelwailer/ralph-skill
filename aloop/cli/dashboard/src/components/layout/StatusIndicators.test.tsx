import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PhaseBadge, ElapsedTimer } from './StatusIndicators';

describe('PhaseBadge', () => {
  it('returns null when phase is empty string', () => {
    const { container } = render(<PhaseBadge phase="" />);
    expect(container.firstChild).toBeNull();
  });

  it('uses fallback color class for unknown phase', () => {
    const { container } = render(<PhaseBadge phase="deploy" />);
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.className).toContain('bg-muted');
    expect(span!.textContent).toBe('deploy');
  });

  it('renders known phase with its specific color', () => {
    const { container } = render(<PhaseBadge phase="build" />);
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.className).toContain('bg-yellow-500/20');
  });
});

describe('ElapsedTimer / formatSecs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats elapsed time as "Ns" when under 1 minute', () => {
    const now = new Date('2024-01-01T00:00:30.000Z');
    vi.setSystemTime(now);
    const since = new Date(now.getTime() - 30_000).toISOString();
    const { container } = render(<ElapsedTimer since={since} />);
    expect(container.textContent).toBe('30s');
  });

  it('formats elapsed time as "Nm" when minutes > 0 and seconds === 0', () => {
    const now = new Date('2024-01-01T00:02:00.000Z');
    vi.setSystemTime(now);
    const since = new Date(now.getTime() - 120_000).toISOString();
    const { container } = render(<ElapsedTimer since={since} />);
    expect(container.textContent).toBe('2m');
  });

  it('formats elapsed time as "Nm Ns" when minutes > 0 and seconds > 0', () => {
    const now = new Date('2024-01-01T00:02:30.000Z');
    vi.setSystemTime(now);
    const since = new Date(now.getTime() - 150_000).toISOString();
    const { container } = render(<ElapsedTimer since={since} />);
    expect(container.textContent).toBe('2m 30s');
  });
});
