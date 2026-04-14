import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QACoverageBadge } from './QACoverageBadge';

function mockFetch(data: unknown, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    json: () => Promise.resolve(data),
  } as Response);
}

describe('QACoverageBadge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders green tone when coverage_percent >= 80', async () => {
    mockFetch({ coverage_percent: 85, available: true, features: [] });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => {
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.className).toContain('text-green-700');
    });
    expect(container.querySelector('button')!.textContent).toContain('85%');
  });

  it('renders red tone when coverage_percent < 50', async () => {
    mockFetch({ coverage_percent: 30, available: true, features: [] });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => {
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.className).toContain('text-red-700');
    });
    expect(container.querySelector('button')!.textContent).toContain('30%');
  });

  it('renders N/A with muted tone when available is false', async () => {
    mockFetch({ available: false, features: [] });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => {
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('N/A');
    });
    expect(container.querySelector('button')!.className).toContain('bg-muted/40');
  });

  it('renders N/A when parseQACoveragePayload receives non-record input (null)', async () => {
    mockFetch(null);
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => {
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('N/A');
    });
  });

  it('uses payload.percentage as fallback when coverage_percent is absent', async () => {
    mockFetch({ percentage: 75, available: true, features: [] });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => {
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('75%');
    });
    // 75% is in the yellow range (>= 50 and < 80)
    expect(container.querySelector('button')!.className).toContain('text-yellow-700');
  });
});
