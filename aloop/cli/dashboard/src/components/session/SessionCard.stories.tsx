import type { Meta, StoryObj } from '@storybook/react';
import { SessionCard } from './SessionCard';
import type { SessionSummary } from '@/lib/types';

const baseSession: SessionSummary = {
  id: 'session-abc123',
  name: 'session-abc123',
  projectName: 'my-project',
  status: 'running',
  phase: 'build',
  elapsed: '5m 32s',
  iterations: '3',
  isActive: true,
  branch: 'feat/my-feature',
  startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  endedAt: '',
  pid: '12345',
  provider: 'claude',
  workDir: '/home/user/my-project',
  stuckCount: 0,
};

const meta: Meta<typeof SessionCard> = {
  title: 'Session/SessionCard',
  component: SessionCard,
  parameters: {
    layout: 'padded',
  },
  args: {
    session: baseSession,
    cardCost: null,
    isSelected: false,
    costUnavailable: false,
    suppressClick: false,
    onSelect: () => {},
    onOpenContextMenu: () => {},
    onClearSuppressClick: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SessionCard>;

export const Running: Story = {};

export const Selected: Story = {
  args: { isSelected: true },
};

export const WithCost: Story = {
  args: { cardCost: 0.0234 },
};

export const Exited: Story = {
  args: {
    session: {
      ...baseSession,
      status: 'exited',
      isActive: false,
      endedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
  },
};

export const Stopped: Story = {
  args: {
    session: {
      ...baseSession,
      status: 'stopped',
      isActive: false,
      endedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
    cardCost: 0.1452,
  },
};

export const ReviewPhase: Story = {
  args: {
    session: {
      ...baseSession,
      phase: 'review',
      iterations: '7',
      elapsed: '18m 04s',
    },
  },
};

export const PlanPhase: Story = {
  args: {
    session: {
      ...baseSession,
      phase: 'plan',
      iterations: '1',
      elapsed: '1m 12s',
    },
  },
};

export const NoBranch: Story = {
  args: {
    session: {
      ...baseSession,
      branch: '',
    },
  },
};

export const Stuck: Story = {
  args: {
    session: {
      ...baseSession,
      stuckCount: 2,
    },
  },
};

export const CostUnavailable: Story = {
  args: {
    costUnavailable: true,
    cardCost: null,
  },
};
