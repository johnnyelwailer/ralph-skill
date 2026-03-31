import type { Meta, StoryObj } from '@storybook/react';
import { QACoverageBadge } from './QACoverageBadge';

const meta: Meta<typeof QACoverageBadge> = {
  title: 'Shared/QACoverageBadge',
  component: QACoverageBadge,
  parameters: {
    layout: 'padded',
  },
  args: {
    sessionId: 'session-abc123',
    refreshKey: '0',
  },
};

export default meta;
type Story = StoryObj<typeof QACoverageBadge>;

export const Default: Story = {};

export const NoSession: Story = {
  args: { sessionId: null },
};
