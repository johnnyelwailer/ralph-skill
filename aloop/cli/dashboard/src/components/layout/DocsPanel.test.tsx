import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DocsPanel, DocContent, HealthPanel } from './DocsPanel';
import type { ProviderHealth } from '@/lib/log';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('DocsPanel', () => {
  it('renders visible tabs for provided docs', () => {
    const docs = { 'TODO.md': '# Todo', 'SPEC.md': '# Spec' };
    render(
      <Wrapper>
        <DocsPanel docs={docs} providerHealth={[]} />
      </Wrapper>,
    );
    expect(screen.getByText('TODO')).toBeInTheDocument();
    expect(screen.getByText('SPEC')).toBeInTheDocument();
  });

  it('always renders the Health tab', () => {
    render(
      <Wrapper>
        <DocsPanel docs={{}} providerHealth={[]} />
      </Wrapper>,
    );
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  it('renders overflow dropdown button when more than 4 docs', () => {
    const docs = {
      'TODO.md': 'a',
      'SPEC.md': 'b',
      'RESEARCH.md': 'c',
      'REVIEW_LOG.md': 'd',
      'STEERING.md': 'e',
    };
    render(
      <Wrapper>
        <DocsPanel docs={docs} providerHealth={[]} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Open overflow document tabs')).toBeInTheDocument();
  });

  it('renders repo link when repoUrl is provided', () => {
    render(
      <Wrapper>
        <DocsPanel docs={{}} providerHealth={[]} repoUrl="https://github.com/example/repo" />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Open repo on GitHub')).toBeInTheDocument();
  });
});

describe('DocContent', () => {
  it('renders placeholder when content is empty', () => {
    render(<DocContent content="" name="TODO.md" />);
    expect(screen.getByText('No content for TODO.md.')).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    render(<DocContent content="# Hello World" name="README.md" />);
    const div = document.querySelector('.prose-dashboard');
    expect(div).not.toBeNull();
    expect(div!.innerHTML).toContain('Hello World');
  });

  it('renders SPEC with collapsible TOC in normal mode', () => {
    render(<DocContent content="# Introduction\n\nBody text." name="SPEC.md" />);
    expect(screen.getByText('Table of Contents')).toBeInTheDocument();
  });

  it('renders SPEC with sticky sidebar TOC in wide mode', () => {
    const { container } = render(
      <DocContent content="# Introduction\n\nBody text." name="SPEC.md" wide={true} />,
    );
    // Wide layout uses grid with two columns; verify both the TOC nav and prose content are present
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav!.textContent).toContain('Introduction');
    const prose = container.querySelector('.prose-dashboard');
    expect(prose).not.toBeNull();
    expect(prose!.innerHTML).toContain('Introduction');
  });

  it('does not render TOC for non-SPEC files even with wide=true', () => {
    render(<DocContent content="# A heading" name="README.md" wide={true} />);
    expect(screen.queryByText('Table of Contents')).toBeNull();
  });
});

describe('HealthPanel', () => {
  it('renders placeholder when no providers', () => {
    render(
      <Wrapper>
        <HealthPanel providers={[]} />
      </Wrapper>,
    );
    expect(screen.getByText('No provider data yet.')).toBeInTheDocument();
  });

  it('renders provider name and status', () => {
    const providers: ProviderHealth[] = [
      { name: 'claude', status: 'healthy', lastEvent: '' },
    ];
    render(
      <Wrapper>
        <HealthPanel providers={providers} />
      </Wrapper>,
    );
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('renders cooldown status with time remaining when cooldownUntil is in the future', () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min from now
    const providers: ProviderHealth[] = [
      { name: 'openai', status: 'cooldown', cooldownUntil: futureTime, lastEvent: '' },
    ];
    render(
      <Wrapper>
        <HealthPanel providers={providers} />
      </Wrapper>,
    );
    expect(screen.getByText('openai')).toBeInTheDocument();
    // Should show something like "cooldown for Xmin"
    expect(screen.getByText(/cooldown for/)).toBeInTheDocument();
  });

  it('renders cooldown ending when cooldownUntil is in the past', () => {
    const pastTime = new Date(Date.now() - 1000).toISOString();
    const providers: ProviderHealth[] = [
      { name: 'openai', status: 'cooldown', cooldownUntil: pastTime, lastEvent: '' },
    ];
    render(
      <Wrapper>
        <HealthPanel providers={providers} />
      </Wrapper>,
    );
    expect(screen.getByText('cooldown ending…')).toBeInTheDocument();
  });

  it('renders failed status', () => {
    const providers: ProviderHealth[] = [
      { name: 'gemini', status: 'failed', lastEvent: '' },
    ];
    render(
      <Wrapper>
        <HealthPanel providers={providers} />
      </Wrapper>,
    );
    expect(screen.getByText('gemini')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('renders unknown status with no activity label', () => {
    const providers: ProviderHealth[] = [
      { name: 'mistral', status: 'unknown', lastEvent: '' },
    ];
    render(
      <Wrapper>
        <HealthPanel providers={providers} />
      </Wrapper>,
    );
    expect(screen.getByText('mistral')).toBeInTheDocument();
    expect(screen.getByText('no activity')).toBeInTheDocument();
  });
});
