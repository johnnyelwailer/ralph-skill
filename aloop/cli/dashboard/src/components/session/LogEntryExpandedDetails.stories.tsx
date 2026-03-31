import type { Meta, StoryObj } from '@storybook/react';
import { LogEntryExpandedDetails } from './LogEntryExpandedDetails';
import type { LogEntry, ManifestPayload } from '@/lib/types';
import { useRef } from 'react';

const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: new Date().toISOString(),
  phase: 'build',
  event: 'iteration_complete',
  provider: 'claude',
  model: 'claude-sonnet-4-20250514',
  duration: '45s',
  message: 'Iteration complete',
  raw: '',
  rawObj: { iteration: 1, cost_usd: 0.0821 },
  iteration: 1,
  dateKey: '2026-03-31',
  isSuccess: true,
  isError: false,
  commitHash: 'abc1234def',
  resultDetail: 'Build passed',
  filesChanged: [
    { path: 'src/index.ts', type: 'M', additions: 15, deletions: 3 },
    { path: 'src/utils.ts', type: 'A', additions: 42, deletions: 0 },
  ],
  isSignificant: true,
  ...overrides,
});

const Wrapper = (props: React.ComponentProps<typeof LogEntryExpandedDetails>) => {
  const ref = useRef<HTMLDivElement>(null);
  return <LogEntryExpandedDetails {...props} outputRef={ref} />;
};

const meta: Meta<typeof Wrapper> = {
  title: 'Session/LogEntryExpandedDetails',
  component: Wrapper,
  parameters: {
    layout: 'padded',
  },
  args: {
    entry: makeEntry(),
    artifacts: null,
    allManifests: [],
    hasOutput: false,
    outputLoading: false,
    outputText: null,
    onLightbox: () => {},
    onComparison: () => {},
    showComparison: null,
    onCloseComparison: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof Wrapper>;

export const WithFiles: Story = {};

export const WithArtifacts: Story = {
  args: {
    artifacts: {
      iteration: 1,
      phase: 'build',
      summary: 'Screenshots captured',
      artifacts: [
        { type: 'screenshot', path: 'screenshot-homepage.png', description: 'Homepage screenshot' },
      ],
    },
  },
};

export const ErrorEntry: Story = {
  args: {
    entry: makeEntry({
      isSuccess: false,
      isError: true,
      resultDetail: 'Build failed',
      filesChanged: [],
      rawObj: { error: 'TypeScript error TS2345', reason: 'tsc exited with code 1' },
    }),
    hasOutput: true,
    outputText: 'Error: TS2345 - Type string is not assignable to type number',
  },
};
