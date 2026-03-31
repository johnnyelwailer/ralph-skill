import type { Meta, StoryObj } from '@storybook/react';
import { ArtifactComparisonHeader } from './ArtifactComparisonHeader';
import type { ArtifactEntry } from '@/lib/types';

const artifact: ArtifactEntry = {
  type: 'screenshot',
  path: 'screenshot-homepage.png',
  description: 'Homepage screenshot',
  metadata: { baseline: 'screenshot-homepage.png', diff_percentage: 12.5 },
};

const meta: Meta<typeof ArtifactComparisonHeader> = {
  title: 'Session/ArtifactComparisonHeader',
  component: ArtifactComparisonHeader,
  parameters: {
    layout: 'padded',
  },
  args: {
    artifact,
    mode: 'side-by-side',
    setMode: () => {},
    hasBaseline: true,
    baselineIters: [1, 2, 3],
    selectedBaseline: 1,
    setSelectedBaseline: () => {},
    onClose: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ArtifactComparisonHeader>;

export const SideBySide: Story = {};

export const SliderMode: Story = {
  args: { mode: 'slider' },
};

export const DiffOverlay: Story = {
  args: { mode: 'diff-overlay' },
};

export const NoBaseline: Story = {
  args: { hasBaseline: false, baselineIters: [], selectedBaseline: null },
};

export const HighDiff: Story = {
  args: {
    artifact: { ...artifact, metadata: { diff_percentage: 45.2 } },
  },
};
