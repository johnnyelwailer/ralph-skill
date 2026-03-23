import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';
import { Button } from './button';

const meta: Meta = {
  title: 'UI/Collapsible',
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <Collapsible open={open} onOpenChange={setOpen} className="w-64">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Collapsible section</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">{open ? 'Close' : 'Open'}</Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
          This is the collapsible content that shows and hides.
        </CollapsibleContent>
      </Collapsible>
    );
  },
};

export const DefaultOpen: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-64">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Always starts open</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">Toggle</Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
        Content visible by default.
      </CollapsibleContent>
    </Collapsible>
  ),
};
