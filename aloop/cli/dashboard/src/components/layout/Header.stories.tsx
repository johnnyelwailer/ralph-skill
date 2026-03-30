import type { Meta, StoryObj } from '@storybook/react';
import { Header, QACoverageBadge } from './Header';
import type { ConnectionStatus } from '@/lib/types';

const meta: Meta<typeof Header> = {
  component: Header,
  title: 'Layout/Header',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Header>;

const baseProps: React.ComponentProps<typeof Header> = {
  sessionName: 'my-project-session',
  isRunning: true,
  currentState: 'running',
  currentPhase: 'build',
  currentIteration: '5',
  providerName: 'claude',
  modelName: 'sonnet',
  tasksCompleted: 3,
  tasksTotal: 8,
  progressPercent: 38,
  updatedAt: '2026-01-15T10:30:00Z',
  loading: false,
  loadError: null,
  connectionStatus: 'connected' as ConnectionStatus,
  onOpenCommand: () => {},
  onOpenSwitcher: () => {},
  stuckCount: 0,
  startedAt: '2026-01-15T09:00:00Z',
  avgDuration: '2m 30s',
  maxIterations: 20,
  onToggleMobileMenu: () => {},
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

export const Default: Story = {
  args: baseProps,
};

export const Loading: Story = {
  args: {
    ...baseProps,
    loading: true,
    updatedAt: '',
  },
};

export const Disconnected: Story = {
  args: {
    ...baseProps,
    connectionStatus: 'disconnected' as ConnectionStatus,
    loadError: 'Connection lost',
  },
};

export const Stopped: Story = {
  args: {
    ...baseProps,
    isRunning: false,
    currentState: 'stopped',
    currentPhase: 'review',
    stuckCount: 2,
  },
};

export const NoProvider: Story = {
  args: {
    ...baseProps,
    providerName: '',
    modelName: '',
    avgDuration: '',
    sessionCost: 0,
  },
};

export const HighBudgetUsage: Story = {
  args: {
    ...baseProps,
    budgetUsedPercent: 92,
  },
};

// QACoverageBadge stories

const qaMeta: Meta<typeof QACoverageBadge> = {
  component: QACoverageBadge,
  title: 'Layout/QACoverageBadge',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export const QABadgeDefault: StoryObj<typeof QACoverageBadge> = {
  render: () => <QACoverageBadge sessionId={null} refreshKey="" />,
  name: 'QA Badge (loading)',
};
