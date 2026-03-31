import type { Meta, StoryObj } from '@storybook/react';
import { LogEntryRow } from './LogEntryRow';
import type { LogEntry } from '@/lib/types';

const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: new Date().toISOString(),
  phase: 'build',
  event: 'iteration_complete',
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
  duration: '45s',
  message: 'Iteration complete',
  raw: '',
  rawObj: null,
  iteration: 1,
  dateKey: '2026-03-31',
  isSuccess: true,
  isError: false,
  commitHash: 'abc1234',
  resultDetail: 'Build passed',
  filesChanged: [],
  isSignificant: true,
  ...overrides,
});

const meta: Meta<typeof LogEntryRow> = {
  title: 'Session/LogEntryRow',
  component: LogEntryRow,
  parameters: {
    layout: 'padded',
  },
  args: {
    entry: makeEntry(),
    artifacts: null,
    allManifests: [],
  },
};

export default meta;
type Story = StoryObj<typeof LogEntryRow>;

export const Success: Story = {};

export const Error: Story = {
  args: {
    entry: makeEntry({
      isSuccess: false,
      isError: true,
      resultDetail: 'Build failed: TypeScript error TS2345',
      filesChanged: [
        { path: 'src/index.ts', type: 'M', additions: 10, deletions: 3 },
      ],
    }),
  },
};

export const Running: Story = {
  args: {
    entry: makeEntry({
      event: 'iteration_running',
      isSuccess: false,
      duration: '',
      commitHash: '',
      resultDetail: '',
      message: 'Running...',
    }),
  },
};

export const WithFiles: Story = {
  args: {
    entry: makeEntry({
      filesChanged: [
        { path: 'src/App.tsx', type: 'M', additions: 28, deletions: 5 },
        { path: 'src/components/Header.tsx', type: 'A', additions: 55, deletions: 0 },
        { path: 'src/legacy/old.ts', type: 'D', additions: 0, deletions: 120 },
      ],
    }),
  },
};
