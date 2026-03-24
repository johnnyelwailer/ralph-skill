import type { Meta, StoryObj } from '@storybook/react';
import { ArtifactViewer } from './ArtifactViewer';
import type { ArtifactEntry, ManifestPayload } from './ArtifactViewer';

const meta: Meta<typeof ArtifactViewer> = {
  title: 'Artifacts/ArtifactViewer',
  component: ArtifactViewer,
  parameters: {
    layout: 'padded',
  },
  args: {
    onLightbox: () => {},
    onComparison: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ArtifactViewer>;

const imageArtifact: ArtifactEntry = {
  type: 'screenshot',
  path: 'screenshot.png',
  description: 'Main page screenshot',
};

const anotherImage: ArtifactEntry = {
  type: 'screenshot',
  path: 'mobile.png',
  description: 'Mobile view screenshot',
};

const textArtifact: ArtifactEntry = {
  type: 'log',
  path: 'output.json',
  description: 'JSON output',
};

const baseManifest: ManifestPayload = {
  iteration: 3,
  phase: 'build',
  summary: '',
  artifacts: [],
};

export const Empty: Story = {
  args: {
    manifest: { ...baseManifest, artifacts: [] },
    allManifests: [],
  },
};

export const SingleImage: Story = {
  args: {
    manifest: { ...baseManifest, artifacts: [imageArtifact] },
    allManifests: [{ ...baseManifest, artifacts: [imageArtifact] }],
  },
};

export const SingleTextArtifact: Story = {
  args: {
    manifest: { ...baseManifest, artifacts: [textArtifact] },
    allManifests: [{ ...baseManifest, artifacts: [textArtifact] }],
  },
};

export const WithDiffBadgeLow: Story = {
  args: {
    manifest: {
      ...baseManifest,
      artifacts: [{ ...imageArtifact, metadata: { diff_percentage: 2.5 } }],
    },
    allManifests: [],
  },
};

export const WithDiffBadgeWarning: Story = {
  args: {
    manifest: {
      ...baseManifest,
      artifacts: [{ ...imageArtifact, metadata: { diff_percentage: 12.3 } }],
    },
    allManifests: [],
  },
};

export const WithDiffBadgeCritical: Story = {
  args: {
    manifest: {
      ...baseManifest,
      artifacts: [{ ...imageArtifact, metadata: { diff_percentage: 45.0 } }],
    },
    allManifests: [],
  },
};

export const WithBaseline: Story = {
  args: {
    manifest: { ...baseManifest, iteration: 5, artifacts: [imageArtifact] },
    allManifests: [
      { ...baseManifest, iteration: 1, artifacts: [{ ...imageArtifact }] },
      { ...baseManifest, iteration: 5, artifacts: [imageArtifact] },
    ],
  },
};

export const WithSummary: Story = {
  args: {
    manifest: {
      ...baseManifest,
      summary: 'Captured 2 artifacts during test run.',
      artifacts: [imageArtifact, textArtifact],
    },
    allManifests: [],
  },
};

export const MultipleArtifacts: Story = {
  args: {
    manifest: {
      ...baseManifest,
      summary: 'Build output with screenshots and logs.',
      artifacts: [imageArtifact, anotherImage, textArtifact],
    },
    allManifests: [],
  },
};
