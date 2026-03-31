import type { Meta, StoryObj } from '@storybook/react';
import { ActivityPanel } from './ActivityPanel';

const now = new Date();
const ts = (offsetMin: number) => new Date(now.getTime() - offsetMin * 60_000).toISOString();

const meta: Meta<typeof ActivityPanel> = {
  title: 'Session/ActivityPanel',
  component: ActivityPanel,
  parameters: {
    layout: 'padded',
  },
  args: {
    log: '',
    artifacts: [],
    currentIteration: null,
    currentPhase: 'build',
    currentProvider: 'claude',
    isRunning: false,
  },
};

export default meta;
type Story = StoryObj<typeof ActivityPanel>;

export const Empty: Story = {};

export const WithEntries: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'plan', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(5), event: 'iteration_complete', phase: 'build', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 1, duration: '45s', commit: 'abc1234def5678', tokens_input: 12500, tokens_output: 3200, cost_usd: 0.0821, files: [{ path: 'src/index.ts', status: 'M', additions: 15, deletions: 3 }] }),
    ].join('\n'),
  },
};

export const Running: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'build', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(5), event: 'iteration_complete', phase: 'build', provider: 'claude', iteration: 1, duration: '45s', cost_usd: 0.062 }),
    ].join('\n'),
    currentIteration: 2,
    currentPhase: 'build',
    isRunning: true,
    iterationStartedAt: ts(1),
  },
};
