import type { Meta, StoryObj } from '@storybook/react';
import { SliderView } from './SliderView';

const meta: Meta<typeof SliderView> = {
  title: 'Session/SliderView',
  component: SliderView,
  parameters: {
    layout: 'padded',
  },
  args: {
    baselineSrc: 'https://placehold.co/400x300/2d2d2d/ffffff?text=Baseline',
    currentSrc: 'https://placehold.co/400x300/3d3d3d/ffffff?text=Current',
    selectedBaseline: 1,
    currentIteration: 3,
    sliderPos: 50,
    setSliderPos: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SliderView>;

export const Default: Story = {};

export const SliderAtStart: Story = {
  args: { sliderPos: 10 },
};

export const SliderAtEnd: Story = {
  args: { sliderPos: 90 },
};
