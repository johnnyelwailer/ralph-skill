import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'ghost', 'outline', 'destructive'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { variant: 'default', children: 'Default' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Outline' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Destructive' },
};

export const SmallDefault: Story = {
  args: { variant: 'default', size: 'sm', children: 'Small Default' },
};

export const SmallGhost: Story = {
  args: { variant: 'ghost', size: 'sm', children: 'Small Ghost' },
};

export const SmallOutline: Story = {
  args: { variant: 'outline', size: 'sm', children: 'Small Outline' },
};

export const SmallDestructive: Story = {
  args: { variant: 'destructive', size: 'sm', children: 'Small Destructive' },
};
