import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar } from './Sidebar';
import type { SessionSummary } from '@/lib/types';

const runningSession: SessionSummary = {
  id: 'sess-001',
  name: 'feature-branch-build',
  projectName: 'my-project',
  status: 'running',
  phase: 'build',
  elapsed: '12m',
  iterations: '4',
  isActive: true,
  branch: 'feat/add-sidebar',
  startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  endedAt: '',
  pid: '12345',
  provider: 'claude',
  workDir: '/home/user/my-project',
  stuckCount: 0,
};

const stoppedSession: SessionSummary = {
  id: 'sess-002',
  name: 'main-build',
  projectName: 'my-project',
  status: 'exited',
  phase: '',
  elapsed: '34m',
  iterations: '12',
  isActive: false,
  branch: 'main',
  startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  endedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  pid: '',
  provider: 'claude',
  workDir: '/home/user/my-project',
  stuckCount: 0,
};

const olderSession: SessionSummary = {
  ...stoppedSession,
  id: 'sess-003',
  name: 'old-feature',
  startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  endedAt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
};

const meta: Meta<typeof Sidebar> = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    sessions: [runningSession, stoppedSession],
    selectedSessionId: null,
    onSelectSession: () => {},
    collapsed: false,
    onToggle: () => {},
    sessionCost: 0.0142,
    isDesktop: false,
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};

export const WithSelectedSession: Story = {
  args: {
    selectedSessionId: 'sess-001',
  },
};

export const WithOlderSessions: Story = {
  args: {
    sessions: [runningSession, stoppedSession, olderSession],
  },
};

export const Collapsed: Story = {
  args: {
    collapsed: true,
  },
};

export const Desktop: Story = {
  args: {
    isDesktop: true,
  },
};

export const Empty: Story = {
  args: {
    sessions: [],
  },
};
