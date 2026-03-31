import type { Meta, StoryObj } from '@storybook/react';
import { SidebarContextMenu } from './SidebarContextMenu';

const meta: Meta<typeof SidebarContextMenu> = {
  title: 'Layout/SidebarContextMenu',
  component: SidebarContextMenu,
  parameters: {
    layout: 'padded',
  },
  args: {
    sessionId: 'session-abc123',
    position: { x: 200, y: 150 },
    onSelectSession: () => {},
    onStopSession: () => {},
    onCopySessionId: () => {},
    onClose: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SidebarContextMenu>;

export const Default: Story = {};

export const CurrentSession: Story = {
  args: { sessionId: 'current' },
};

export const NearEdge: Story = {
  args: { position: { x: 10, y: 50 } },
};
