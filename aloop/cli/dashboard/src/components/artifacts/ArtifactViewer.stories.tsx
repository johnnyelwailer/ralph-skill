import type { Meta, StoryObj } from '@storybook/react';
import { ArtifactViewer } from './ArtifactViewer';
import type { ArtifactEntry, ManifestPayload } from './ArtifactViewer';

const mockManifest: ManifestPayload = {
  iteration: 1,
  phase: 'build',
  summary: 'Test run artifacts',
  artifacts: [
    { path: 'output.png', type: 'image', description: 'Test image', metadata: { baseline: '0' } },
    { path: 'summary.txt', type: 'text', description: 'Test summary' },
  ],
};

const mockAllManifests: ManifestPayload[] = [mockManifest];

const meta: Meta<typeof ArtifactViewer> = {
  title: 'Components/ArtifactViewer',
  component: ArtifactViewer,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ArtifactViewer>;

export const Empty: Story = {
  args: {
    manifest: { iteration: 1, phase: 'build', summary: '', artifacts: [] },
    allManifests: [],
    onLightbox: () => {},
    onComparison: () => {},
  },
};

export const WithArtifacts: Story = {
  args: {
    manifest: mockManifest,
    allManifests: mockAllManifests,
    onLightbox: (src) => console.log('Lightbox:', src),
    onComparison: (artifact, iteration) => console.log('Comparison:', artifact, iteration),
  },
};

export const WithDiffPercentage: Story = {
  args: {
    manifest: {
      iteration: 5,
      phase: 'build',
      summary: '',
      artifacts: [
        { path: 'output.png', type: 'image', description: 'Low diff', metadata: { diff_percentage: 3.2, baseline: '0' } },
        { path: 'output.png', type: 'image', description: 'Medium diff', metadata: { diff_percentage: 15.7, baseline: '0' } },
        { path: 'output.png', type: 'image', description: 'High diff', metadata: { diff_percentage: 45.2, baseline: '0' } },
      ],
    },
    allManifests: mockAllManifests,
    onLightbox: () => {},
    onComparison: () => {},
  },
};

export const TextArtifacts: Story = {
  args: {
    manifest: {
      iteration: 1,
      phase: 'build',
      summary: 'Build artifacts',
      artifacts: [
        { path: 'error.log', type: 'text', description: 'Error log' },
        { path: 'result.json', type: 'text', description: 'JSON output' },
      ],
    },
    allManifests: [],
    onLightbox: () => {},
    onComparison: () => {},
  },
};

export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    manifest: mockManifest,
    allManifests: mockAllManifests,
    onLightbox: () => {},
    onComparison: () => {},
  },
};