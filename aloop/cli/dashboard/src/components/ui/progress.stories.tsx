import type { Meta, StoryObj } from '@storybook/react';
import { Progress } from './progress';

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: { value: 40, className: 'w-64' },
};

export const Empty: Story = {
  args: { value: 0, className: 'w-64' },
};

export const Half: Story = {
  args: { value: 50, className: 'w-64' },
};

export const Full: Story = {
  args: { value: 100, className: 'w-64' },
};

export const Colored: Story = {
  args: { value: 70, className: 'w-64', indicatorClassName: 'bg-green-500' },
};
