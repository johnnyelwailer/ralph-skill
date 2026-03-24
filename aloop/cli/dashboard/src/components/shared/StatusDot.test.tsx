import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StatusDot, ConnectionIndicator } from './StatusDot';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

describe('StatusDot', () => {
  it('renders label for running status', () => {
    render(<StatusDot status="running" />, { wrapper });
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders label for stopped status', () => {
    render(<StatusDot status="stopped" />, { wrapper });
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('renders label for exited status', () => {
    render(<StatusDot status="exited" />, { wrapper });
    expect(screen.getByText('Exited')).toBeInTheDocument();
  });

  it('renders label for unhealthy status', () => {
    render(<StatusDot status="unhealthy" />, { wrapper });
    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
  });

  it('renders label for error status', () => {
    render(<StatusDot status="error" />, { wrapper });
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders label for stuck status', () => {
    render(<StatusDot status="stuck" />, { wrapper });
    expect(screen.getByText('Stuck')).toBeInTheDocument();
  });

  it('renders label for unknown status', () => {
    render(<StatusDot status="unknown" />, { wrapper });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders fallback unknown label for unrecognised status', () => {
    render(<StatusDot status="nonexistent" />, { wrapper });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<StatusDot status="stopped" className="my-custom" />, { wrapper });
    expect(container.querySelector('.my-custom')).toBeTruthy();
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
