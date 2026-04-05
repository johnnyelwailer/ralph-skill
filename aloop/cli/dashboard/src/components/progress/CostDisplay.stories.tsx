import type { Meta, StoryObj } from '@storybook/react';
import { CostDisplay } from './CostDisplay';

const meta: Meta<typeof CostDisplay> = {
  title: 'Components/CostDisplay',
  component: CostDisplay,
  tags: ['autodocs'],
  argTypes: {
    totalCost: { control: 'number' },
    budgetCap: { control: 'number' },
    budgetUsedPercent: { control: 'number' },
    isLoading: { control: 'boolean' },
    sessionCost: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof CostDisplay>;

export const Empty: Story = {
  args: {
    totalCost: null,
    budgetCap: null,
    budgetUsedPercent: null,
  },
};

export const Default: Story = {
  args: {
    totalCost: 12.5,
    budgetCap: 100,
    budgetUsedPercent: 12.5,
  },
};

export const HalfBudget: Story = {
  args: {
    totalCost: 50,
    budgetCap: 100,
    budgetUsedPercent: 50,
  },
};

export const NearLimit: Story = {
  args: {
    totalCost: 85,
    budgetCap: 100,
    budgetUsedPercent: 85,
  },
};

export const AtLimit: Story = {
  args: {
    totalCost: 100,
    budgetCap: 100,
    budgetUsedPercent: 100,
  },
};

export const OverBudget: Story = {
  args: {
    totalCost: 120,
    budgetCap: 100,
    budgetUsedPercent: 120,
  },
};

export const Loading: Story = {
  args: {
    totalCost: null,
    budgetCap: 100,
    budgetUsedPercent: null,
    isLoading: true,
  },
};

export const OpencodeUnavailable: Story = {
  args: {
    totalCost: null,
    budgetCap: 100,
    budgetUsedPercent: null,
    error: 'opencode_unavailable',
    sessionCost: 25.5,
  },
};

export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    totalCost: 45,
    budgetCap: 100,
    budgetUsedPercent: 45,
  },
};

export const WithWarnings: Story = {
  args: {
    totalCost: 80,
    budgetCap: 100,
    budgetUsedPercent: 80,
    budgetWarnings: [50, 75, 90],
    budgetPauseThreshold: 95,
  },
};