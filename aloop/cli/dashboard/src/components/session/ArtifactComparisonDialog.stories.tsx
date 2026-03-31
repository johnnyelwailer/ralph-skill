import type { Meta, StoryObj } from '@storybook/react';
import { ArtifactComparisonDialog } from './ArtifactComparisonDialog';
import type { ArtifactEntry, ManifestPayload } from '@/lib/types';

const artifact: ArtifactEntry = {
  type: 'screenshot',
  path: 'screenshot-homepage.png',
  description: 'Homepage screenshot',
  metadata: { baseline: 'screenshot-homepage.png', diff_percentage: 12.5 },
};

const manifests: ManifestPayload[] = [
  {
    iteration: 1,
    phase: 'build',
    summary: 'Initial screenshot',
    artifacts: [
      { type: 'screenshot', path: 'screenshot-homepage.png', description: 'Homepage v1' },
    ],
  },
  {
    iteration: 2,
    phase: 'build',
    summary: 'Updated screenshot',
    artifacts: [
      { type: 'screenshot', path: 'screenshot-homepage.png', description: 'Homepage v2' },
    ],
  },
];

const meta: Meta<typeof ArtifactComparisonDialog> = {
  title: 'Session/ArtifactComparisonDialog',
  component: ArtifactComparisonDialog,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    artifact,
    currentIteration: 3,
    allManifests: manifests,
    onClose: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ArtifactComparisonDialog>;

export const Default: Story = {};

export const NoBaseline: Story = {
  args: {
    artifact: {
      type: 'screenshot',
      path: 'screenshot-new-feature.png',
      description: 'New feature screenshot',
    },
    allManifests: [
      {
        iteration: 1,
        phase: 'build',
        summary: 'First capture',
        artifacts: [
          { type: 'screenshot', path: 'screenshot-new-feature.png', description: 'First capture' },
        ],
      },
    ],
  },
};
