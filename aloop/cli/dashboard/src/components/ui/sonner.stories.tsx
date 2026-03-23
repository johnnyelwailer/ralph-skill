import type { Meta, StoryObj } from '@storybook/react';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Button } from './button';

const meta: Meta<typeof Toaster> = {
  title: 'UI/Toaster',
  component: Toaster,
  decorators: [
    (Story) => (
      <div>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  render: () => (
    <div className="p-4">
      <Toaster />
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => toast('Default toast message')}>Show Toast</Button>
        <Button variant="outline" onClick={() => toast.success('Success!')}>Success</Button>
        <Button variant="destructive" onClick={() => toast.error('Something went wrong')}>Error</Button>
      </div>
    </div>
  ),
};
