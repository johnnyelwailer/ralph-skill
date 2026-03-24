import type { Meta, StoryObj } from '@storybook/react';
import { ElapsedTimer } from './ElapsedTimer';

const meta: Meta<typeof ElapsedTimer> = {
  title: 'Shared/ElapsedTimer',
  component: ElapsedTimer,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof ElapsedTimer>;

const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
const ninetySecondsAgo = new Date(Date.now() - 90_000).toISOString();
const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();

export const JustStarted: Story = {
  args: {
    since: tenSecondsAgo,
  },
};

export const NinetySeconds: Story = {
  args: {
    since: ninetySecondsAgo,
  },
};

export const TwoMinutes: Story = {
  args: {
    since: twoMinutesAgo,
  },
};
