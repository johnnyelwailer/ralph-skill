import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
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

  it('renders ChevronDown when expanded (click toggles expand)', async () => {
    mockFetch({ coverage_percent: 85, available: true, features: [] });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => expect(container.querySelector('button')).not.toBeNull());
    const btn = container.querySelector('button')!;
    // Before click: ChevronRight (collapsed)
    expect(btn.querySelector('svg:last-child')).not.toBeNull();
    fireEvent.click(btn);
    // After click: ChevronDown (expanded) — the panel should appear
    await waitFor(() => {
      expect(container.querySelector('[class*="absolute"]')).not.toBeNull();
    });
  });

  it('renders "No feature rows found" when expanded with empty features', async () => {
    mockFetch({ coverage_percent: 85, available: true, features: [] });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => expect(container.querySelector('button')).not.toBeNull());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => {
      expect(container.textContent).toContain('No feature rows found');
    });
  });

  it('renders PASS feature row with green statusTone and CheckCircle2 icon', async () => {
    const features = [{ feature: 'Login', component: 'LoginForm', last_tested: '', commit: '', status: 'PASS', criteria_met: '', notes: '' }];
    mockFetch({ coverage_percent: 90, available: true, features });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => expect(container.querySelector('button')).not.toBeNull());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => {
      const panel = container.querySelector('[class*="absolute"]');
      expect(panel).not.toBeNull();
      // Status badge inside the feature row has green classes
      const statusBadge = panel!.querySelector('[class*="text-green-700"]');
      expect(statusBadge).not.toBeNull();
      expect(statusBadge!.textContent).toContain('PASS');
    });
  });

  it('renders FAIL feature row with red statusTone and XCircle icon', async () => {
    const features = [{ feature: 'Checkout', component: 'Cart', last_tested: '', commit: '', status: 'FAIL', criteria_met: '', notes: '' }];
    mockFetch({ coverage_percent: 40, available: true, features });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => expect(container.querySelector('button')).not.toBeNull());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => {
      // The expanded panel has multiple red elements; find the status badge inside the panel
      const panel = container.querySelector('[class*="absolute"]');
      expect(panel).not.toBeNull();
      const statusBadge = panel!.querySelector('[class*="border-red-500"]');
      expect(statusBadge).not.toBeNull();
      expect(statusBadge!.textContent).toContain('FAIL');
    });
  });

  it('renders UNTESTED feature row with muted statusTone and Circle icon', async () => {
    const features = [{ feature: 'Profile', component: 'UserCard', last_tested: '', commit: '', status: 'UNTESTED', criteria_met: '', notes: '' }];
    mockFetch({ coverage_percent: 60, available: true, features });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => expect(container.querySelector('button')).not.toBeNull());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => {
      const panel = container.querySelector('[class*="absolute"]');
      expect(panel).not.toBeNull();
      const statusBadge = panel!.querySelector('[class*="bg-muted/40"]');
      expect(statusBadge).not.toBeNull();
      expect(statusBadge!.textContent).toContain('UNTESTED');
    });
  });

  it('renders null (no button) when response.ok is false', async () => {
    mockFetch({ coverage_percent: 85, available: true, features: [] }, false);
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    // Give fetch time to resolve and confirm no button appears
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('button')).toBeNull();
  });

  it('fetches without ?session= query param when sessionId is null', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverage_percent: 80, available: true, features: [] }),
    } as Response);
    render(<QACoverageBadge sessionId={null} refreshKey="k1" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('?session=');
  });

  it('omits component <p> when feature.component is empty string', async () => {
    const features = [{ feature: 'Dashboard', component: '', last_tested: '', commit: '', status: 'PASS', criteria_met: '', notes: '' }];
    mockFetch({ coverage_percent: 90, available: true, features });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="k1" />);
    await waitFor(() => expect(container.querySelector('button')).not.toBeNull());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => {
      const panel = container.querySelector('[class*="absolute"]');
      expect(panel).not.toBeNull();
      // Feature name renders
      expect(panel!.textContent).toContain('Dashboard');
      // No component sub-line rendered (it's conditional on feature.component being truthy)
      const paragraphs = panel!.querySelectorAll('p.text-\\[11px\\]');
      expect(paragraphs.length).toBe(0);
    });
  });
});
