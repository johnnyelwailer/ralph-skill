import type { Meta, StoryObj } from '@storybook/react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';
import { Button } from './button';

const meta: Meta = {
  title: 'UI/HoverCard',
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="outline">Hover over me</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="text-sm">
          <p className="font-semibold">Hover Card Title</p>
          <p className="text-muted-foreground">Additional details shown on hover.</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const WithAvatar: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="ghost">@username</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="text-sm space-y-1">
          <p className="font-semibold">Display Name</p>
          <p className="text-muted-foreground">User bio or description here.</p>
          <p className="text-xs text-muted-foreground">Joined January 2025</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
