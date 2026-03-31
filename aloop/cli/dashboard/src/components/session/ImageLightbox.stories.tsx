import type { Meta, StoryObj } from '@storybook/react';
import { ImageLightbox } from './ImageLightbox';

const meta: Meta<typeof ImageLightbox> = {
  title: 'Session/ImageLightbox',
  component: ImageLightbox,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    src: 'https://placehold.co/800x600/1a1a2e/eee?text=Artifact',
    alt: 'Artifact screenshot',
    onClose: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ImageLightbox>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    src: 'https://placehold.co/600x400/16213e/eee?text=Homepage',
    alt: 'Homepage screenshot from iteration 3',
  },
};
