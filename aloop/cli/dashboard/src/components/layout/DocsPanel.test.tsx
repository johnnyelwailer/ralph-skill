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
      { name: 'claude', status: 'healthy', lastEvent: null },
    ];
    render(
      <Wrapper>
        <HealthPanel providers={providers} />
      </Wrapper>,
    );
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });
});
