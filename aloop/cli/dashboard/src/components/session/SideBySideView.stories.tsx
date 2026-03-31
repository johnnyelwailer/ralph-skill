import type { Meta, StoryObj } from '@storybook/react';
import { SideBySideView } from './SideBySideView';

const meta: Meta<typeof SideBySideView> = {
  title: 'Session/SideBySideView',
  component: SideBySideView,
  parameters: {
    layout: 'padded',
  },
  args: {
    baselineSrc: 'https://placehold.co/400x300/2d2d2d/ffffff?text=Baseline',
    currentSrc: 'https://placehold.co/400x300/3d3d3d/ffffff?text=Current',
    selectedBaseline: 1,
    currentIteration: 3,
  },
};

export default meta;
type Story = StoryObj<typeof SideBySideView>;

export const Default: Story = {};

export const FirstIteration: Story = {
  args: {
    selectedBaseline: 1,
    currentIteration: 2,
  },
};
