import type { Meta, StoryObj } from '@storybook/react';
import { SteerInput } from './SteerInput';

const meta: Meta<typeof SteerInput> = {
  title: 'Session/SteerInput',
  component: SteerInput,
  parameters: {
    layout: 'padded',
  },
  args: {
    steerInstruction: '',
    setSteerInstruction: () => {},
    onSteer: () => {},
    steerSubmitting: false,
    onStop: () => {},
    stopSubmitting: false,
    onResume: () => {},
    resumeSubmitting: false,
    isRunning: true,
  },
};

export default meta;
type Story = StoryObj<typeof SteerInput>;

export const Idle: Story = {};

export const WithText: Story = {
  args: {
    steerInstruction: 'Fix the failing test in auth.spec.ts',
  },
};

export const Sending: Story = {
  args: {
    steerInstruction: 'Refactor the parser',
    steerSubmitting: true,
  },
};

export const StopSubmitting: Story = {
  args: {
    stopSubmitting: true,
  },
};

export const Paused: Story = {
  args: {
    isRunning: false,
  },
};

export const PausedWithText: Story = {
  args: {
    isRunning: false,
    steerInstruction: 'Continue with the next task',
  },
};

export const ResumeSubmitting: Story = {
  args: {
    isRunning: false,
    resumeSubmitting: true,
  },
};
