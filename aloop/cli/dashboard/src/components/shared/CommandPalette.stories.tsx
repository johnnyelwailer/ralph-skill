import type { Meta, StoryObj } from '@storybook/react';
import { CommandPalette } from './CommandPalette';
import type { SessionSummary } from '@/lib/types';

const sessions: SessionSummary[] = [
  { id: 'current', name: 'Current Session', projectName: 'aloop', status: 'running', phase: 'build', elapsed: '2m 30s', iterations: '5', isActive: true, branch: 'main', startedAt: '2026-03-30T10:00:00Z', endedAt: '', pid: '1234', provider: 'claude', workDir: '/tmp/aloop', stuckCount: 0 },
  { id: 's2', name: 'feature-auth', projectName: 'aloop', status: 'stopped', phase: 'review', elapsed: '15m', iterations: '12', isActive: false, branch: 'feature/auth', startedAt: '2026-03-30T09:00:00Z', endedAt: '2026-03-30T09:15:00Z', pid: '', provider: 'codex', workDir: '/tmp/aloop-2', stuckCount: 0 },
  { id: 's3', name: 'stuck-session', projectName: 'other', status: 'stuck', phase: 'plan', elapsed: '45m', iterations: '30', isActive: true, branch: 'develop', startedAt: '2026-03-30T08:00:00Z', endedAt: '', pid: '5678', provider: 'gemini', workDir: '/tmp/aloop-3', stuckCount: 3 },
];

const meta: Meta<typeof CommandPalette> = {
  title: 'Shared/CommandPalette',
  component: CommandPalette,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CommandPalette>;

export const Default: Story = {
  args: {
    open: true,
    onClose: () => {},
    sessions,
    onSelectSession: () => {},
    onStop: () => {},
  },
};

export const EmptySessions: Story = {
  args: {
    open: true,
    onClose: () => {},
    sessions: [],
    onSelectSession: () => {},
    onStop: () => {},
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onClose: () => {},
    sessions,
    onSelectSession: () => {},
    onStop: () => {},
  },
};
