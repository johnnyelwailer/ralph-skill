import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityPanel, DocContent, HealthPanel } from './App';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { TooltipProvider } from './components/ui/tooltip';

describe('App.tsx ActivityPanel, DocContent and HealthPanel coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('covers ActivityPanel and LogEntryRow exhaustive', async () => {
    const log = JSON.stringify({
      event: 'iteration_complete',
      provider: 'c',
      iteration: 1,
      timestamp: new Date().toISOString(),
      message: 'built something',
      files: [{ path: 'f1.ts', status: 'M', additions: 10, deletions: 5 }],
      metadata: { some: 'data' },
    });
    const artifacts = [{
      iteration: 1,
      manifest: {
        phase: 'build',
        artifacts: [
          { path: 'a.png', type: 'screenshot', description: 'desc' },
          { path: 'b.txt', type: 'file', description: 'desc', metadata: { diff_percentage: 10 } },
        ],
      },
    }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('build output', { status: 200 })));
    render(createElement(TooltipProvider as any, {}, createElement(ActivityPanel, {
      log,
      artifacts: artifacts as any[],
      currentIteration: 2,
      currentPhase: 'build',
      currentProvider: 'c',
      isRunning: true,
    })));
    const row = screen.getByText('built something').closest('div');
    if (row) fireEvent.click(row);
    const imgArtifact = await screen.findByRole('img', { name: 'a.png' });
    expect(imgArtifact).toBeInTheDocument();
    fireEvent.click(imgArtifact.closest('button')!);
    expect(await screen.findByText('b.txt')).toBeInTheDocument();
  });

  it('covers DocContent and HealthPanel', () => {
    render(createElement(DocContent, { content: '# H1\n## H2', name: 'SPEC.md', wide: true }));
    expect(screen.getByText(/Table of Contents/i)).toBeInTheDocument();
    render(createElement(DocContent, { content: '', name: 'Empty.md' }));
    expect(screen.getByText(/No content/i)).toBeInTheDocument();
    const providers = [{ name: 'p1', status: 'cooldown', lastEvent: 't', cooldownUntil: new Date(Date.now() + 100000).toISOString() }];
    render(createElement(TooltipProvider as any, {}, createElement(HealthPanel, { providers: providers as any[] })));
    expect(screen.getByText('p1')).toBeInTheDocument();
  });
});
