import type { Meta, StoryObj } from '@storybook/react';
import { HealthPanel } from '../../AppView';
import type { ProviderHealth } from '../../AppView';

const meta: Meta<typeof HealthPanel> = {
  title: 'Dashboard/HealthPanel',
  component: HealthPanel,
};

export default meta;
type Story = StoryObj<typeof HealthPanel>;

const mockProviders: ProviderHealth[] = [
  { name: 'claude', status: 'healthy', lastEvent: new Date(Date.now() - 1000 * 60 * 5).toISOString(), consecutiveFailures: 0 },
  { name: 'codex', status: 'cooldown', lastEvent: new Date(Date.now() - 1000 * 60 * 10).toISOString(), consecutiveFailures: 2, cooldownUntil: new Date(Date.now() + 1000 * 60 * 30).toISOString() },
  { name: 'gemini', status: 'failed', lastEvent: new Date(Date.now() - 1000 * 60 * 2).toISOString(), consecutiveFailures: 5, reason: 'API quota exceeded' },
  { name: 'opencode', status: 'unknown', lastEvent: '', consecutiveFailures: 0 },
];

export const Default: Story = {
  args: {
    providers: mockProviders,
  },
};

export const Empty: Story = {
  args: {
    providers: [],
  },
};