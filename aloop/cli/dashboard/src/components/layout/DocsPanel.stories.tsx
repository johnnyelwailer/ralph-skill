import type { Meta, StoryObj } from '@storybook/react';
import { DocsPanel, type DocsPanelProps } from './DocsPanel';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

const meta: Meta<typeof DocsPanel> = {
  component: DocsPanel,
  title: 'Layout/DocsPanel',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[500px] w-[400px] border rounded-md overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DocsPanel>;

const baseDocs = {
  'TODO.md': '# TODO\n- [ ] Task one\n- [ ] Task two',
  'SPEC.md': '# Spec\n\n## Overview\n\nSome content here.',
  'RESEARCH.md': '# Research\n\nInitial investigation',
  'STEERING.md': '# Steering\n\nNo steering yet',
};

const baseProps: DocsPanelProps = {
  docs: baseDocs,
  providerHealth: [],
  activityCollapsed: false,
  repoUrl: null,
};

export const Default: Story = {
  args: baseProps,
};

export const WithRepoUrl: Story = {
  args: {
    ...baseProps,
    repoUrl: 'https://github.com/test/repo',
  },
};

export const WithProviderHealth: Story = {
  args: {
    ...baseProps,
    providerHealth: [
      { name: 'claude', status: 'healthy', lastEvent: '2024-01-01' },
      { name: 'openai', status: 'cooldown', lastEvent: '2024-01-01', reason: 'rate limit' },
    ] as ProviderHealth[],
  },
};

export const ActivityCollapsed: Story = {
  args: {
    ...baseProps,
    activityCollapsed: true,
  },
};

export const EmptyDocs: Story = {
  args: {
    docs: {},
    providerHealth: [],
    activityCollapsed: false,
    repoUrl: null,
  },
};

export const ManyDocuments: Story = {
  args: {
    docs: {
      'TODO.md': '# TODO\n- [ ] Task',
      'SPEC.md': '# Spec',
      'RESEARCH.md': '# Research',
      'REVIEW_LOG.md': '# Review\nNotes',
      'STEERING.md': '# Steering',
      'EXTRA1.md': '# Extra 1',
      'EXTRA2.md': '# Extra 2',
    },
    providerHealth: [],
    activityCollapsed: false,
    repoUrl: null,
  },
};