import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StatusDot, ConnectionIndicator } from './StatusDot';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

describe('StatusDot', () => {
  it('renders dot element for running status', () => {
    const { container } = render(<StatusDot status="running" />, { wrapper });
    expect(container.querySelector('.animate-pulse-dot')).toBeTruthy();
  });

  it('renders static dot for non-running status', () => {
    const { container } = render(<StatusDot status="stopped" />, { wrapper });
    const dot = container.querySelector('.bg-muted-foreground\\/50');
    expect(dot).toBeTruthy();
  });

  it('renders pulse animation for running status', () => {
    const { container } = render(<StatusDot status="running" />, { wrapper });
    const pulse = container.querySelector('.animate-pulse-dot');
    expect(pulse).toBeTruthy();
  });

  it('applies green color for running status', () => {
    const { container } = render(<StatusDot status="running" />, { wrapper });
    expect(container.querySelector('.bg-green-500')).toBeTruthy();
  });

  it('applies red color for unhealthy status', () => {
    const { container } = render(<StatusDot status="unhealthy" />, { wrapper });
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('applies red color for error status', () => {
    const { container } = render(<StatusDot status="error" />, { wrapper });
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('applies orange color for stuck status', () => {
    const { container } = render(<StatusDot status="stuck" />, { wrapper });
    expect(container.querySelector('.bg-orange-500')).toBeTruthy();
  });

  it('applies fallback unknown config for unknown status', () => {
    const { container } = render(<StatusDot status="nonexistent" />, { wrapper });
    expect(container.querySelector('.bg-muted-foreground\\/30')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<StatusDot status="stopped" className="my-custom" />, { wrapper });
    const dot = container.querySelector('.my-custom');
    expect(dot).toBeTruthy();
  });

  it('renders exited status with muted color', () => {
    const { container } = render(<StatusDot status="exited" />, { wrapper });
    expect(container.querySelector('.bg-muted-foreground\\/50')).toBeTruthy();
  });

  it('renders unknown status fallback label', () => {
    const { container } = render(<StatusDot status="unknown" />, { wrapper });
    expect(container.querySelector('.bg-muted-foreground\\/30')).toBeTruthy();
  });
});

describe('ConnectionIndicator', () => {
  it('renders connected state with green color', () => {
    const { container } = render(<ConnectionIndicator status="connected" />, { wrapper });
    expect(container.querySelector('.text-green-500')).toBeTruthy();
  });

  it('renders connecting state with yellow color and spin', () => {
    const { container } = render(<ConnectionIndicator status="connecting" />, { wrapper });
    const icon = container.querySelector('.text-yellow-500');
    expect(icon).toBeTruthy();
    expect(icon?.classList.contains('animate-spin')).toBe(true);
  });

  it('renders disconnected state with red color', () => {
    const { container } = render(<ConnectionIndicator status="disconnected" />, { wrapper });
    expect(container.querySelector('.text-red-500')).toBeTruthy();
  });

  it('displays "Live" label for connected', () => {
    render(<ConnectionIndicator status="connected" />, { wrapper });
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('displays "Connecting..." label for connecting', () => {
    render(<ConnectionIndicator status="connecting" />, { wrapper });
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('displays "Disconnected" label for disconnected', () => {
    render(<ConnectionIndicator status="disconnected" />, { wrapper });
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
