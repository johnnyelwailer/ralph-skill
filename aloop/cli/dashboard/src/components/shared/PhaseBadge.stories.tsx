import type { Meta, StoryObj } from '@storybook/react';
import { PhaseBadge } from './PhaseBadge';

const meta: Meta<typeof PhaseBadge> = {
  title: 'Shared/PhaseBadge',
  component: PhaseBadge,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof PhaseBadge>;

export const Plan: Story = {
  args: { phase: 'plan' },
};

export const Build: Story = {
  args: { phase: 'build' },
};

export const Proof: Story = {
  args: { phase: 'proof' },
};

export const Review: Story = {
  args: { phase: 'review' },
};

export const Unknown: Story = {
  args: { phase: 'custom' },
};

export const Small: Story = {
  args: { phase: 'plan', small: true },
};
