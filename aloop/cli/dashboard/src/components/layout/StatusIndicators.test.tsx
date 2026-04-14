import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PhaseBadge, ElapsedTimer, StatusDot, ConnectionIndicator } from './StatusIndicators';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

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

describe('StatusDot', () => {
  it('renders animated pulse dot for running status', () => {
    const { container } = renderWithTooltip(<StatusDot status="running" />);
    // The trigger wraps the dot in an inline-flex span
    const triggerSpan = container.querySelector('span.inline-flex');
    expect(triggerSpan).not.toBeNull();
    // Running dot: outer relative span containing two child spans
    const relativeDot = triggerSpan!.querySelector('span.relative');
    expect(relativeDot).not.toBeNull();
    const children = Array.from(relativeDot!.querySelectorAll(':scope > span'));
    expect(children.length).toBe(2);
    // One of the children has animate-pulse-dot
    const pulseSpan = children.find(s => s.className.includes('animate-pulse-dot'));
    expect(pulseSpan).not.toBeNull();
  });

  it('renders static dot for stopped status', () => {
    const { container } = renderWithTooltip(<StatusDot status="stopped" />);
    const triggerSpan = container.querySelector('span.inline-flex');
    expect(triggerSpan).not.toBeNull();
    // Static dot: single self-closing span with no children
    const staticDot = triggerSpan!.querySelector('span');
    expect(staticDot).not.toBeNull();
    expect(staticDot!.className).toContain('bg-muted-foreground/50');
    expect(staticDot!.children.length).toBe(0);
  });

  it('falls back to unknown config for unknown status', () => {
    const { container } = renderWithTooltip(<StatusDot status="idle" />);
    const triggerSpan = container.querySelector('span.inline-flex');
    expect(triggerSpan).not.toBeNull();
    const staticDot = triggerSpan!.querySelector('span');
    expect(staticDot).not.toBeNull();
    expect(staticDot!.className).toContain('bg-muted-foreground/30');
  });
});

describe('ConnectionIndicator', () => {
  it('renders Zap icon and "Live" text for connected status', () => {
    const { container } = renderWithTooltip(<ConnectionIndicator status="connected" />);
    const text = container.querySelector('span.text-\\[10px\\]');
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe('Live');
    // Icon svg has text-green-500 class
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.className.baseVal).toContain('text-green-500');
  });

  it('renders Loader2 icon with animate-spin and "Connecting..." text for connecting status', () => {
    const { container } = renderWithTooltip(<ConnectionIndicator status="connecting" />);
    const text = container.querySelector('span.text-\\[10px\\]');
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe('Connecting...');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.className.baseVal).toContain('animate-spin');
  });

  it('renders AlertTriangle icon and "Disconnected" text for disconnected status', () => {
    const { container } = renderWithTooltip(<ConnectionIndicator status="disconnected" />);
    const text = container.querySelector('span.text-\\[10px\\]');
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe('Disconnected');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.className.baseVal).toContain('text-red-500');
  });
});
