import type { Meta, StoryObj } from '@storybook/react';
import { CostDisplay } from './CostDisplay';

const meta: Meta<typeof CostDisplay> = {
  title: 'Progress/CostDisplay',
  component: CostDisplay,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof CostDisplay>;

export const NoBudgetCap: Story = {
  args: {
    totalCost: 1.23,
    budgetCap: null,
    budgetUsedPercent: null,
  },
};

export const WithBudgetLow: Story = {
  args: {
    totalCost: 0.50,
    budgetCap: 10.0,
    budgetUsedPercent: 5,
  },
};

export const WithBudgetWarning: Story = {
  args: {
    totalCost: 7.5,
    budgetCap: 10.0,
    budgetUsedPercent: 75,
    budgetWarnings: [70, 90],
  },
};

export const WithBudgetCritical: Story = {
  args: {
    totalCost: 9.5,
    budgetCap: 10.0,
    budgetUsedPercent: 95,
    budgetWarnings: [70, 90],
    budgetPauseThreshold: 95,
  },
};

export const Loading: Story = {
  args: {
    totalCost: null,
    budgetCap: 10.0,
    budgetUsedPercent: null,
    isLoading: true,
  },
};

export const OpenCodeUnavailableNoSession: Story = {
  args: {
    totalCost: null,
    budgetCap: null,
    budgetUsedPercent: null,
    error: 'opencode_unavailable',
    sessionCost: 0,
  },
};

export const OpenCodeUnavailableWithSession: Story = {
  args: {
    totalCost: null,
    budgetCap: 10.0,
    budgetUsedPercent: null,
    error: 'opencode_unavailable',
    sessionCost: 2.45,
  },
};
