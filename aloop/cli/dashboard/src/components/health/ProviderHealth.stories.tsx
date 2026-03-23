import type { Meta, StoryObj } from '@storybook/react';
import { HealthPanel } from './ProviderHealth';
import type { ProviderHealth } from './ProviderHealth';

const meta: Meta<typeof HealthPanel> = {
  title: 'Health/ProviderHealth',
  component: HealthPanel,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof HealthPanel>;

const now = new Date().toISOString();
const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
const cooldownUntil = new Date(Date.now() + 15 * 60_000).toISOString();

export const Empty: Story = {
  args: { providers: [] },
};

export const AllHealthy: Story = {
  args: {
    providers: [
      { name: 'claude', status: 'healthy', lastEvent: now },
      { name: 'gemini', status: 'healthy', lastEvent: fiveMinAgo },
      { name: 'opencode', status: 'healthy', lastEvent: twoHoursAgo },
    ] satisfies ProviderHealth[],
  },
};

export const Mixed: Story = {
  args: {
    providers: [
      { name: 'claude', status: 'healthy', lastEvent: now },
      { name: 'gemini', status: 'cooldown', lastEvent: fiveMinAgo, cooldownUntil, reason: 'Rate limit exceeded' },
      { name: 'opencode', status: 'failed', lastEvent: twoHoursAgo, reason: 'Auth error', consecutiveFailures: 3 },
      { name: 'codex', status: 'unknown', lastEvent: '' },
    ] satisfies ProviderHealth[],
  },
};

export const AllFailed: Story = {
  args: {
    providers: [
      { name: 'claude', status: 'failed', lastEvent: fiveMinAgo, reason: 'API key invalid', consecutiveFailures: 5 },
      { name: 'gemini', status: 'failed', lastEvent: twoHoursAgo, reason: 'Quota exceeded', consecutiveFailures: 2 },
    ] satisfies ProviderHealth[],
  },
};

export const SingleProvider: Story = {
  args: {
    providers: [
      { name: 'claude', status: 'healthy', lastEvent: now },
    ] satisfies ProviderHealth[],
  },
};
