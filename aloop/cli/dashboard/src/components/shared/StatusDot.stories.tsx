import type { Meta, StoryObj } from '@storybook/react';
import { StatusDot, ConnectionIndicator } from './StatusDot';

const statusMeta: Meta<typeof StatusDot> = {
  title: 'Shared/StatusDot',
  component: StatusDot,
  parameters: {
    layout: 'padded',
  },
};

export default statusMeta;
type StatusStory = StoryObj<typeof StatusDot>;

export const Running: StatusStory = {
  args: { status: 'running' },
};

export const Stopped: StatusStory = {
  args: { status: 'stopped' },
};

export const Exited: StatusStory = {
  args: { status: 'exited' },
};

export const Unhealthy: StatusStory = {
  args: { status: 'unhealthy' },
};

export const Error: StatusStory = {
  args: { status: 'error' },
};

export const Stuck: StatusStory = {
  args: { status: 'stuck' },
};

export const Unknown: StatusStory = {
  args: { status: 'unknown' },
};

const connectionMeta: Meta<typeof ConnectionIndicator> = {
  title: 'Shared/ConnectionIndicator',
  component: ConnectionIndicator,
  parameters: {
    layout: 'padded',
  },
};

type ConnectionStory = StoryObj<typeof ConnectionIndicator>;

export const Connected: ConnectionStory = {
  render: () => <ConnectionIndicator status="connected" />,
};

export const Connecting: ConnectionStory = {
  render: () => <ConnectionIndicator status="connecting" />,
};

export const Disconnected: ConnectionStory = {
  render: () => <ConnectionIndicator status="disconnected" />,
};
