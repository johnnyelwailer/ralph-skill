import type { Meta, StoryObj } from '@storybook/react';
import { ScrollArea } from './scroll-area';

const meta: Meta<typeof ScrollArea> = {
  title: 'UI/ScrollArea',
  component: ScrollArea,
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-40 w-48 rounded border p-2">
      {Array.from({ length: 20 }, (_, i) => (
        <div key={i} className="py-1 text-sm">Item {i + 1}</div>
      ))}
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-64 rounded border p-2">
      <div className="flex gap-2">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="w-16 shrink-0 rounded bg-muted p-2 text-sm text-center">
            {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
