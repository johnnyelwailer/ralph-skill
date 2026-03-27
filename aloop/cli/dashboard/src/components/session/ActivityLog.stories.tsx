import type { Meta, StoryObj } from '@storybook/react';
import { ActivityPanel } from './ActivityLog';

const now = new Date();
const ts = (offsetMin: number) => new Date(now.getTime() - offsetMin * 60_000).toISOString();

const meta: Meta<typeof ActivityPanel> = {
  title: 'Session/ActivityLog',
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

export const SessionStart: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'plan', provider: 'claude', message: 'Session started' }),
    ].join('\n'),
  },
};

export const IterationComplete: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'plan', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(5), event: 'iteration_complete', phase: 'build', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 1, duration: '45s', commit: 'abc1234def5678', tokens_input: 12500, tokens_output: 3200, cost_usd: 0.0821, files: [{ path: 'src/index.ts', status: 'M', additions: 15, deletions: 3 }, { path: 'src/utils.ts', status: 'A', additions: 42, deletions: 0 }] }),
    ].join('\n'),
  },
};

export const WithArtifacts: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'proof', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(5), event: 'iteration_complete', phase: 'proof', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 1, duration: '1m 23s', tokens_input: 18000, tokens_output: 5100, cost_usd: 0.1245 }),
    ].join('\n'),
    artifacts: [{
      iteration: 1,
      manifest: {
        phase: 'proof',
        summary: 'UI screenshots captured',
        artifacts: [
          { type: 'screenshot', path: 'screenshot-homepage.png', description: 'Homepage screenshot' },
          { type: 'screenshot', path: 'screenshot-settings.png', description: 'Settings page screenshot' },
        ],
      },
    }],
  },
};

export const ErrorIteration: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'build', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(7), event: 'iteration_complete', phase: 'build', provider: 'claude', iteration: 1, duration: '32s', commit: 'aaa1111', cost_usd: 0.045 }),
      JSON.stringify({ timestamp: ts(3), event: 'iteration_error', phase: 'build', provider: 'claude', iteration: 2, duration: '12s', error: 'Build failed: TypeScript error TS2345', reason: 'tsc exited with code 1' }),
    ].join('\n'),
  },
};

export const MultipleIterations: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(30), event: 'session_start', phase: 'plan', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(25), event: 'iteration_complete', phase: 'plan', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 1, duration: '1m 02s', commit: 'aaa1111', tokens_input: 10000, tokens_output: 2800, cost_usd: 0.065 }),
      JSON.stringify({ timestamp: ts(18), event: 'iteration_complete', phase: 'build', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 2, duration: '2m 15s', commit: 'bbb2222', tokens_input: 22000, tokens_output: 6400, cost_usd: 0.152, files: [{ path: 'src/App.tsx', status: 'M', additions: 28, deletions: 5 }, { path: 'src/components/Header.tsx', status: 'A', additions: 55, deletions: 0 }, { path: 'src/legacy/old.ts', status: 'D', additions: 0, deletions: 120 }] }),
      JSON.stringify({ timestamp: ts(10), event: 'iteration_complete', phase: 'build', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 3, duration: '1m 48s', commit: 'ccc3333', tokens_input: 15000, tokens_output: 4100, cost_usd: 0.098 }),
      JSON.stringify({ timestamp: ts(3), event: 'iteration_complete', phase: 'review', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 4, duration: '55s', cost_usd: 0.041 }),
    ].join('\n'),
    currentIteration: 4,
    currentPhase: 'review',
  },
};

export const RunningIteration: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(15), event: 'session_start', phase: 'build', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(10), event: 'iteration_complete', phase: 'build', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 1, duration: '1m 20s', commit: 'aaa1111', tokens_input: 14000, tokens_output: 3800, cost_usd: 0.091 }),
      JSON.stringify({ timestamp: ts(5), event: 'iteration_complete', phase: 'build', provider: 'claude', model: 'claude-sonnet-4-20250514', iteration: 2, duration: '2m 05s', commit: 'bbb2222', cost_usd: 0.134 }),
    ].join('\n'),
    currentIteration: 3,
    currentPhase: 'build',
    currentProvider: 'claude',
    isRunning: true,
    iterationStartedAt: ts(1),
  },
};

export const ProviderCooldown: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'build', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(7), event: 'iteration_complete', phase: 'build', provider: 'claude', iteration: 1, duration: '45s', cost_usd: 0.062 }),
      JSON.stringify({ timestamp: ts(5), event: 'provider_cooldown', provider: 'claude', message: 'Rate limited, cooling down for 30s' }),
      JSON.stringify({ timestamp: ts(3), event: 'provider_recovered', provider: 'claude', message: 'Provider recovered' }),
      JSON.stringify({ timestamp: ts(1), event: 'iteration_complete', phase: 'build', provider: 'claude', iteration: 2, duration: '38s', cost_usd: 0.051 }),
    ].join('\n'),
  },
};

export const ReviewVerdict: Story = {
  args: {
    log: [
      JSON.stringify({ timestamp: ts(10), event: 'session_start', phase: 'review', provider: 'claude', message: 'Session started' }),
      JSON.stringify({ timestamp: ts(5), event: 'review_verdict_read', phase: 'review', provider: 'claude', iteration: 1, verdict: 'approved', message: 'All gates passed' }),
    ].join('\n'),
    currentIteration: 1,
    currentPhase: 'review',
  },
};
