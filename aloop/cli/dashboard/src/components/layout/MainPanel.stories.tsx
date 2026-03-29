import type { Meta, StoryObj } from '@storybook/react';
import { MainPanel, type MainPanelProps } from './MainPanel';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

const meta: Meta<typeof MainPanel> = {
  component: MainPanel,
  title: 'Layout/MainPanel',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[600px] w-full border rounded-md overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MainPanel>;

const baseProps: MainPanelProps = {
  docs: { 'TODO.md': '# TODO\n- [ ] Task one\n- [ ] Task two' },
  log: '[]',
  artifacts: [],
  repoUrl: 'https://github.com/test/repo',
  providerHealth: [] as ProviderHealth[],
  activePanel: 'docs' as const,
  setActivePanel: () => {},
  activityCollapsed: false,
  setActivityCollapsed: () => {},
  currentIterationNum: 3,
  currentPhase: 'build',
  currentProvider: 'claude',
  isRunning: true,
  iterationStartedAt: new Date().toISOString(),
  steerInstruction: '',
  setSteerInstruction: () => {},
  onSteer: () => {},
  steerSubmitting: false,
  onStop: () => {},
  stopSubmitting: false,
  onResume: () => {},
  resumeSubmitting: false,
};

export const Default: Story = {
  args: baseProps,
};

export const ActivityPanelActive: Story = {
  args: {
    ...baseProps,
    activePanel: 'activity',
  },
};

export const ActivityCollapsed: Story = {
  args: {
    ...baseProps,
    activityCollapsed: true,
  },
};

export const NotRunning: Story = {
  args: {
    ...baseProps,
    isRunning: false,
  },
};

export const MultipleIterations: Story = {
  args: {
    ...baseProps,
    currentIterationNum: 10,
    currentPhase: 'review',
  },
};

export const EmptySession: Story = {
  args: {
    docs: {},
    log: '',
    artifacts: [],
    repoUrl: null,
    providerHealth: [],
    activePanel: 'docs' as const,
    setActivePanel: () => {},
    activityCollapsed: false,
    setActivityCollapsed: () => {},
    currentIterationNum: null,
    currentPhase: '',
    currentProvider: '',
    isRunning: false,
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

export const WithLogs: Story = {
  args: {
    ...baseProps,
    log: JSON.stringify({ event: 'iteration_complete', iteration: 1 }),
  },
};