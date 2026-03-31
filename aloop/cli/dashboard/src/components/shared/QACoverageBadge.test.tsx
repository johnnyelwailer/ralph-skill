import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QACoverageBadge, parseQACoveragePayload } from './QACoverageBadge';

// ── parseQACoveragePayload unit tests ──

describe('parseQACoveragePayload', () => {
  it('returns defaults when payload is not a record', () => {
    expect(parseQACoveragePayload(null)).toEqual({ percentage: null, available: false, features: [] });
    expect(parseQACoveragePayload('string')).toEqual({ percentage: null, available: false, features: [] });
    expect(parseQACoveragePayload(42)).toEqual({ percentage: null, available: false, features: [] });
  });

  it('uses coverage_percent when present', () => {
    const result = parseQACoveragePayload({ coverage_percent: 80, available: true, features: [] });
    expect(result.percentage).toBe(80);
  });

  it('falls back to payload.percentage when coverage_percent is missing', () => {
    const result = parseQACoveragePayload({ percentage: 65, available: true, features: [] });
    expect(result.percentage).toBe(65);
  });

  it('sets percentage to null when neither coverage_percent nor percentage is a number', () => {
    const result = parseQACoveragePayload({ available: true, features: [] });
    expect(result.percentage).toBeNull();
  });

  it('defaults available to true when not a boolean', () => {
    const result = parseQACoveragePayload({ coverage_percent: 80, features: [] });
    expect(result.available).toBe(true);
  });

  it('respects available: false', () => {
    const result = parseQACoveragePayload({ available: false, features: [] });
    expect(result.available).toBe(false);
  });

  it('returns empty features when payload.features is not an array', () => {
    const result = parseQACoveragePayload({ available: true, features: 'bad' });
    expect(result.features).toEqual([]);
  });

  it('filters out non-record feature entries', () => {
    const result = parseQACoveragePayload({ available: true, features: [null, 'bad', 42, { feature: 'Auth', status: 'PASS' }] });
    expect(result.features).toHaveLength(1);
    expect(result.features[0].feature).toBe('Auth');
  });

  it('maps PASS and FAIL statuses correctly', () => {
    const result = parseQACoveragePayload({
      available: true,
      features: [
        { feature: 'A', status: 'pass' },
        { feature: 'B', status: 'fail' },
      ],
    });
    expect(result.features[0].status).toBe('PASS');
    expect(result.features[1].status).toBe('FAIL');
  });

  it('maps unknown string status to UNTESTED', () => {
    const result = parseQACoveragePayload({ available: true, features: [{ feature: 'C', status: 'unknown' }] });
    expect(result.features[0].status).toBe('UNTESTED');
  });

  it('maps non-string status to UNTESTED', () => {
    const result = parseQACoveragePayload({ available: true, features: [{ feature: 'D', status: null }] });
    expect(result.features[0].status).toBe('UNTESTED');
  });
});

// ── QACoverageBadge component tests ──

describe('QACoverageBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders nothing while loading (coverage is null)', () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    expect(container.querySelector('.relative')).toBeNull();
  });

  it('renders nothing when response.ok is false', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const { container } = render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    // response.ok=false → loadCoverage returns early → coverage stays null → component renders null
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.relative')).toBeNull();
  });

  it('renders QA N/A when coverage is unavailable', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA N/A')).toBeInTheDocument();
    });
  });

  it('renders green tone for percentage ≥ 80', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 85, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 85%')).toBeInTheDocument();
    });
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('green');
  });

  it('renders yellow tone for percentage between 50 and 79', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 65, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 65%')).toBeInTheDocument();
    });
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('yellow');
  });

  it('renders red tone for percentage < 50', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 30, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 30%')).toBeInTheDocument();
    });
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('red');
  });

  it('uses payload.percentage fallback when coverage_percent is missing', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, percentage: 72, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 72%')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully and shows QA N/A', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA N/A')).toBeInTheDocument();
    });
  });

  it('shows "No feature rows found" empty state when features list is empty', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 90, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 90%')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No feature rows found in QA coverage table.')).toBeInTheDocument();
    });
  });

  it('expands to show PASS and FAIL features on click', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        coverage_percent: 90,
        features: [
          { feature: 'Auth', component: 'login', status: 'PASS' },
          { feature: 'Upload', component: 'files', status: 'FAIL' },
        ],
      }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 90%')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Auth')).toBeInTheDocument();
      expect(screen.getByText('Upload')).toBeInTheDocument();
      expect(screen.getByText('PASS')).toBeInTheDocument();
      expect(screen.getByText('FAIL')).toBeInTheDocument();
    });
  });

  it('shows UNTESTED status for features with non-string status', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        coverage_percent: 50,
        features: [{ feature: 'Login', component: 'auth', status: null }],
      }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 50%')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('UNTESTED')).toBeInTheDocument();
    });
  });

  it('collapses expanded panel on second click', async () => {
    const user = userEvent.setup();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 80, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No feature rows found in QA coverage table.')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.queryByText('No feature rows found in QA coverage table.')).toBeNull();
    });
  });

  it('builds fetch URL with sessionId query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 90, features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<QACoverageBadge sessionId="my-session" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 90%')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('session=my-session'),
      expect.any(Object),
    );
  });

  it('builds fetch URL without query param when sessionId is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 90, features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<QACoverageBadge sessionId={null} refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 90%')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/qa-coverage', expect.any(Object));
  });
});
