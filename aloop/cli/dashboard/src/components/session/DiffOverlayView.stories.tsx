import type { Meta, StoryObj } from '@storybook/react';
import { DiffOverlayView } from './DiffOverlayView';

const meta: Meta<typeof DiffOverlayView> = {
  title: 'Session/DiffOverlayView',
  component: DiffOverlayView,
  parameters: {
    layout: 'padded',
  },
  args: {
    baselineSrc: 'https://placehold.co/800x600/2d2d2d/ffffff?text=Baseline',
    currentSrc: 'https://placehold.co/800x600/3d3d3d/ffffff?text=Current',
    selectedBaseline: 1,
    currentIteration: 3,
  },
};

export default meta;
type Story = StoryObj<typeof DiffOverlayView>;

export const Default: Story = {};

export const HighOpacity: Story = {
  args: { currentIteration: 5 },
};
