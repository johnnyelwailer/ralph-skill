import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'ghost', 'outline', 'destructive'],
    },
    size: {
      control: { type: 'select' },
      options: ['default', 'sm'],
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
  args: {
    children: 'Button',
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const WithCustomContent: Story = {
  args: {
    children: 'Custom content',
  },
};