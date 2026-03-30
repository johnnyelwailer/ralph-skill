import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MainPanel, type MainPanelProps } from './MainPanel';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

const defaultProps: MainPanelProps = {
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

function renderMainPanel(overrides: Partial<typeof defaultProps> = {}) {
  return render(
    <TooltipProvider>
      <div className="flex flex-col h-screen">
        <MainPanel {...defaultProps} {...overrides} />
      </div>
    </TooltipProvider>,
  );
}

describe('MainPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders mobile panel toggle buttons', () => {
    renderMainPanel();
    expect(screen.getAllByRole('button', { name: /Documents/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Activity/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('calls setActivePanel with "activity" when Activity button clicked', () => {
    const setActivePanel = vi.fn();
    renderMainPanel({ setActivePanel });
    const buttons = screen.getAllByText('Activity');
    fireEvent.click(buttons[0]);
    expect(setActivePanel).toHaveBeenCalledWith('activity');
  });

  it('calls setActivePanel with "docs" when Documents button clicked', () => {
    const setActivePanel = vi.fn();
    renderMainPanel({ setActivePanel, activePanel: 'activity' });
    const buttons = screen.getAllByText('Documents');
    fireEvent.click(buttons[0]);
    expect(setActivePanel).toHaveBeenCalledWith('docs');
  });

  it('renders documents panel card', () => {
    renderMainPanel();
    expect(screen.getAllByRole('button', { name: /Documents/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders activity panel card', () => {
    renderMainPanel();
    expect(screen.getAllByRole('button', { name: /Activity/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('calls setActivityCollapsed when collapse button clicked', () => {
    const setActivityCollapsed = vi.fn();
    renderMainPanel({ setActivityCollapsed, activityCollapsed: false });
    const collapseBtn = screen.getByLabelText('Collapse activity panel');
    fireEvent.click(collapseBtn);
    expect(setActivityCollapsed).toHaveBeenCalledWith(true);
  });

  it('passes props to DocsPanel', () => {
    renderMainPanel({
      docs: { 'SPEC.md': '# Spec content' },
      providerHealth: [{ name: 'claude', status: 'healthy', lastEvent: '' }] as ProviderHealth[],
    });
    expect(screen.getByText('Spec content')).toBeInTheDocument();
  });

  it('handles panel display', () => {
    renderMainPanel();
    expect(screen.getAllByRole('button', { name: /Documents/i }).length).toBeGreaterThanOrEqual(1);
  });
});