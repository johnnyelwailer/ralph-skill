import type { Meta, StoryObj } from '@storybook/react';
import { CollapsedSidebar } from './CollapsedSidebar';
import type { SessionSummary } from '@/lib/types';

const makeSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 'session-1',
  name: 'session-1',
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
  ...overrides,
});

const sessions: SessionSummary[] = [
  makeSession({ id: 's1', name: 's1', status: 'running', isActive: true }),
  makeSession({ id: 's2', name: 's2', status: 'exited', isActive: false }),
  makeSession({ id: 's3', name: 's3', status: 'stopped', isActive: false }),
];

const meta: Meta<typeof CollapsedSidebar> = {
  title: 'Layout/CollapsedSidebar',
  component: CollapsedSidebar,
  parameters: {
    layout: 'padded',
  },
  args: {
    sessions,
    onSelectSession: () => {},
    onToggle: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof CollapsedSidebar>;

export const Default: Story = {};

export const Empty: Story = {
  args: { sessions: [] },
};

export const ManySessions: Story = {
  args: {
    sessions: Array.from({ length: 10 }, (_, i) =>
      makeSession({ id: `s${i}`, name: `s${i}`, status: i % 2 === 0 ? 'running' : 'exited', isActive: i % 2 === 0 }),
    ),
  },
};
