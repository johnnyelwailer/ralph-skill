import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'ghost'],
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
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    variant: 'destructive',
    size: 'default',
  },
};

export const Outline: Story = {
  args: {
    children: 'Outline',
    variant: 'outline',
    size: 'default',
  },
};

export const Ghost: Story = {
  args: {
    children: 'Ghost',
    variant: 'ghost',
    size: 'default',
  },
};

export const Small: Story = {
  args: {
    children: 'Small Button',
    variant: 'default',
    size: 'sm',
  },
};

export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    children: 'Dark Mode Button',
    variant: 'default',
    size: 'default',
  },
};