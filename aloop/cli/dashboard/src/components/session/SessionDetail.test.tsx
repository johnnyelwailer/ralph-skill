import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionDetail, type SessionDetailProps } from './SessionDetail';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

const defaultProps: SessionDetailProps = {
  docs: { 'TODO.md': '# TODO\n- [ ] Task one' },
  log: '',
  artifacts: [],
  repoUrl: null,
  providerHealth: [] as ProviderHealth[],
  activePanel: 'docs' as const,
  setActivePanel: vi.fn(),
  activityCollapsed: false,
  setActivityCollapsed: vi.fn(),
  currentIterationNum: 3,
  currentPhase: 'build',
  currentProvider: 'claude',
  isRunning: true,
  iterationStartedAt: '',
  steerInstruction: '',
  setSteerInstruction: vi.fn(),
  onSteer: vi.fn(),
  steerSubmitting: false,
  onStop: vi.fn(),
  stopSubmitting: false,
  onResume: vi.fn(),
  resumeSubmitting: false,
};

function renderDetail(overrides: Partial<typeof defaultProps> = {}) {
  return render(
    <TooltipProvider>
      <div className="flex flex-col h-screen">
        <SessionDetail {...defaultProps} {...overrides} />
      </div>
    </TooltipProvider>,
  );
}

describe('SessionDetail', () => {
  it('renders mobile panel toggle buttons', () => {
    renderDetail();
    expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(1);
  });

  it('calls setActivePanel with "activity" when Activity button is clicked', () => {
    const setActivePanel = vi.fn();
    renderDetail({ setActivePanel });
    // Find the button in the mobile toggle (not the card header)
    const buttons = screen.getAllByText('Activity');
    fireEvent.click(buttons[0]);
    expect(setActivePanel).toHaveBeenCalledWith('activity');
  });

  it('calls setActivePanel with "docs" when Documents button is clicked', () => {
    const setActivePanel = vi.fn();
    renderDetail({ setActivePanel, activePanel: 'activity' });
    const buttons = screen.getAllByText('Documents');
    fireEvent.click(buttons[0]);
    expect(setActivePanel).toHaveBeenCalledWith('docs');
  });

  it('renders docs panel with TODO tab when docs contains TODO.md', () => {
    renderDetail();
    expect(screen.getByRole('tab', { name: 'TODO' })).toBeInTheDocument();
  });

  it('renders Health tab in docs panel', () => {
    renderDetail();
    expect(screen.getByRole('tab', { name: /Health/i })).toBeInTheDocument();
  });

  it('renders the SteerInput component', () => {
    renderDetail();
    expect(screen.getByPlaceholderText(/steer/i)).toBeInTheDocument();
  });

  it('shows activity panel with collapse button when not collapsed', () => {
    renderDetail({ activityCollapsed: false });
    expect(screen.getByLabelText('Collapse activity panel')).toBeInTheDocument();
  });

  it('calls setActivityCollapsed(true) when collapse button is clicked', () => {
    const setActivityCollapsed = vi.fn();
    renderDetail({ activityCollapsed: false, setActivityCollapsed });
    fireEvent.click(screen.getByLabelText('Collapse activity panel'));
    expect(setActivityCollapsed).toHaveBeenCalledWith(true);
  });

  it('shows collapsed activity button when activityCollapsed is true', () => {
    renderDetail({ activityCollapsed: true });
    expect(screen.getAllByText('Activity').length).toBeGreaterThanOrEqual(1);
  });

  it('shows repo link when repoUrl is provided', () => {
    renderDetail({ repoUrl: 'https://github.com/org/repo' });
    expect(screen.getByLabelText('Open repo on GitHub')).toBeInTheDocument();
  });
});
