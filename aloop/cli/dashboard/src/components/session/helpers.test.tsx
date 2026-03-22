import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PhaseBadge, StatusDot, STATUS_DOT_CONFIG, relativeTime } from '@/components/session/helpers';
import { TooltipProvider } from '@/components/ui/tooltip';

const statusCases = [
  { status: 'running', color: 'bg-green-500' },
  { status: 'stopped', color: 'bg-muted-foreground/50' },
  { status: 'exited', color: 'bg-muted-foreground/50' },
  { status: 'unhealthy', color: 'bg-red-500' },
  { status: 'error', color: 'bg-red-500' },
  { status: 'stuck', color: 'bg-orange-500' },
  { status: 'unknown', color: 'bg-muted-foreground/30' },
] as const;

describe('relativeTime', () => {
  it('returns empty string for invalid date input', () => {
    expect(relativeTime('not-a-date')).toBe('');
  });
});

describe('PhaseBadge', () => {
  it('uses fallback styling for unknown phase', () => {
    const { getByText } = render(<PhaseBadge phase="mystery" />, { wrapper: TooltipProvider });
    const badge = getByText('mystery');
    expect(badge).toHaveClass('bg-muted');
    expect(badge).toHaveClass('text-muted-foreground');
    expect(badge).toHaveClass('border-border');
  });
});

describe('StatusDot', () => {
  it('defines all expected status variants', () => {
    expect(Object.keys(STATUS_DOT_CONFIG).sort()).toEqual(
      ['running', 'stopped', 'exited', 'unhealthy', 'error', 'stuck', 'unknown'].sort(),
    );
  });

  it.each(statusCases)('renders expected color for $status', ({ status, color }) => {
    const { container } = render(<StatusDot status={status} />, { wrapper: TooltipProvider });
    const hasColor = Array.from(container.querySelectorAll('span')).some((el) =>
      typeof el.className === 'string' && el.className.includes(color),
    );
    expect(hasColor).toBe(true);
  });
});
