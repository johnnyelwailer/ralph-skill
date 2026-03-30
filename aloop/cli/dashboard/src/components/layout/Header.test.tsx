import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header, QACoverageBadge } from './Header';
import type { ConnectionStatus } from '@/lib/types';

vi.mock('@/hooks/useCost', () => ({
  useCost: () => ({ sessionCost: 0, totalCost: null, budgetCap: null, budgetUsedPercent: null, isLoading: false, error: null }),
}));

const defaultHeaderProps: React.ComponentProps<typeof Header> = {
  sessionName: 'test-session',
  isRunning: true,
  currentState: 'running',
  currentPhase: 'build',
  currentIteration: '3',
  providerName: 'claude',
  modelName: 'sonnet',
  tasksCompleted: 2,
  tasksTotal: 5,
  progressPercent: 40,
  updatedAt: '2026-01-01T00:00:00Z',
  loading: false,
  loadError: null,
  connectionStatus: 'connected' as ConnectionStatus,
  onOpenCommand: vi.fn(),
  onOpenSwitcher: vi.fn(),
  stuckCount: 0,
  startedAt: '2026-01-01T00:00:00Z',
  avgDuration: '2m 30s',
  maxIterations: 10,
  onToggleMobileMenu: vi.fn(),
  selectedSessionId: null,
  qaCoverageRefreshKey: '',
  sessionCost: 1.2345,
  totalCost: 5.6789,
  budgetCap: 10,
  budgetUsedPercent: 56.79,
  costError: null,
  costLoading: false,
  budgetWarnings: [0.5, 0.8],
  budgetPauseThreshold: 0.9,
};

function renderHeader(overrides: Partial<typeof defaultHeaderProps> = {}) {
  return render(
    <TooltipProvider>
      <Header {...defaultHeaderProps} {...overrides} />
    </TooltipProvider>,
  );
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders session name', () => {
    renderHeader();
    expect(screen.getByText('test-session')).toBeInTheDocument();
  });

  it('renders phase badge', () => {
    renderHeader({ currentPhase: 'build' });
    expect(screen.getByText(/build/i)).toBeInTheDocument();
  });

  it('renders iteration info', () => {
    renderHeader({ currentIteration: '5', maxIterations: 20 });
    expect(screen.getByText(/iter 5\/20/)).toBeInTheDocument();
  });

  it('renders iteration with infinity when maxIterations is null', () => {
    renderHeader({ currentIteration: '3', maxIterations: null });
    expect(screen.getByText(/iter 3\/∞/)).toBeInTheDocument();
  });

  it('renders progress bar with correct percentage', () => {
    renderHeader({ progressPercent: 75 });
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders provider/model name', () => {
    renderHeader({ providerName: 'claude', modelName: 'sonnet' });
    expect(screen.getByText('claude/sonnet')).toBeInTheDocument();
  });

  it('renders provider only when modelName is empty', () => {
    renderHeader({ providerName: 'openai', modelName: '' });
    expect(screen.getByText('openai')).toBeInTheDocument();
  });

  it('renders connection indicator', () => {
    renderHeader({ connectionStatus: 'connected' });
    expect(screen.getByTestId('session-header-grid')).toBeInTheDocument();
  });

  it('calls onToggleMobileMenu when sidebar toggle is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderHeader({ onToggleMobileMenu: onToggle });
    await user.click(screen.getByLabelText('Toggle sidebar'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSwitcher when session name is clicked', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderHeader({ onOpenSwitcher: onOpen });
    await user.click(screen.getByText('test-session'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders status label', () => {
    renderHeader({ currentState: 'running' });
    expect(screen.getByTestId('header-status')).toHaveTextContent('running');
  });

  it('renders updated-at timestamp', () => {
    renderHeader({ updatedAt: '2026-01-01T00:00:00Z', loading: false });
    expect(screen.getByTestId('header-updated-at')).toBeInTheDocument();
  });

  it('shows Loading when loading is true', () => {
    renderHeader({ loading: true, updatedAt: '' });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows err suffix when loadError is present', () => {
    renderHeader({ loadError: 'Network error' });
    expect(screen.getByTestId('header-updated-at')).toHaveTextContent('err');
  });

  it('renders elapsed timer when startedAt is provided', () => {
    renderHeader({ startedAt: '2026-01-01T00:00:00Z' });
    const elapsedElements = screen.getAllByText(/\d/);
    expect(elapsedElements.length).toBeGreaterThan(0);
  });

  it('renders session cost in hover card', async () => {
    const user = userEvent.setup();
    renderHeader({ sessionCost: 2.5 });
    const iterSpan = screen.getByText(/iter 3\/10/);
    await user.hover(iterSpan);
    await waitFor(() => {
      expect(screen.getByText(/Session cost:/)).toBeInTheDocument();
    });
  });
});

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

  it('renders percentage when coverage is available', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, coverage_percent: 85, features: [] }),
    });
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA 85%')).toBeInTheDocument();
    });
  });

  it('expands to show features on click', async () => {
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
    await user.click(screen.getByText('QA 90%'));
    await waitFor(() => {
      expect(screen.getByText('Auth')).toBeInTheDocument();
      expect(screen.getByText('Upload')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<QACoverageBadge sessionId="s1" refreshKey="" />);
    await waitFor(() => {
      expect(screen.getByText('QA N/A')).toBeInTheDocument();
    });
  });
});
