import type { Meta, StoryObj } from '@storybook/react';
import { SessionDetail } from './SessionDetail';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

const sampleDocs = {
  'TODO.md': '# TODO\n\n- [x] Task one\n- [ ] Task two\n- [ ] Task three\n',
  'SPEC.md': '# Spec\n\n## Overview\n\nThis is the spec document.\n',
};

const providerHealth: ProviderHealth[] = [
  { name: 'claude', status: 'healthy', lastEvent: new Date().toISOString() },
  { name: 'openai', status: 'cooldown', lastEvent: new Date().toISOString(), reason: 'Rate limit', consecutiveFailures: 2 },
];

const meta: Meta<typeof SessionDetail> = {
  title: 'Session/SessionDetail',
  component: SessionDetail,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    docs: sampleDocs,
    log: '',
    artifacts: [],
    repoUrl: null,
    providerHealth: [],
    activePanel: 'docs',
    setActivePanel: () => {},
    activityCollapsed: false,
    setActivityCollapsed: () => {},
    currentIterationNum: 5,
    currentPhase: 'build',
    currentProvider: 'claude',
    isRunning: true,
    iterationStartedAt: '',
    steerInstruction: '',
    setSteerInstruction: () => {},
    onSteer: () => {},
    steerSubmitting: false,
    onStop: () => {},
    stopSubmitting: false,
    onResume: () => {},
    resumeSubmitting: false,
  },
};

export default meta;
type Story = StoryObj<typeof SessionDetail>;

export const Default: Story = {};

export const WithProviderHealth: Story = {
  args: {
    providerHealth,
  },
};

export const ActivityPanelActive: Story = {
  args: {
    activePanel: 'activity',
  },
};

export const ActivityCollapsed: Story = {
  args: {
    activityCollapsed: true,
  },
};

export const WithRepoLink: Story = {
  args: {
    repoUrl: 'https://github.com/org/repo',
  },
};
