import type { Meta, StoryObj } from '@storybook/react';
import { ResponsiveLayout } from './ResponsiveLayout';

const meta: Meta<typeof ResponsiveLayout> = {
  title: 'Layout/ResponsiveLayout',
  component: ResponsiveLayout,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: (
      <div className="p-4 h-64 flex items-center justify-center bg-muted">
        <span className="text-sm text-muted-foreground">ResponsiveLayout content</span>
      </div>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof ResponsiveLayout>;

export const Default: Story = {};

export const WithCustomClass: Story = {
  args: { className: 'border border-dashed border-border' },
};
