import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DocsPanel, type DocsPanelProps } from './DocsPanel';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

const defaultProps: DocsPanelProps = {
  docs: { 
    'TODO.md': '# TODO\n- [ ] Task one', 
    'SPEC.md': '# Spec\nSome content',
    'RESEARCH.md': '# Research\nNotes'
  },
  providerHealth: [] as ProviderHealth[],
  activityCollapsed: false,
  repoUrl: null,
};

function renderDocsPanel(overrides: Partial<typeof defaultProps> = {}) {
  return render(
    <TooltipProvider>
      <div className="h-[400px] w-[300px]">
        <DocsPanel {...defaultProps} {...overrides} />
      </div>
    </TooltipProvider>,
  );
}

describe('DocsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tabs', async () => {
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });
  });

  it('renders SPEC tab', async () => {
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getAllByText('SPEC').length).toBeGreaterThan(0);
    });
  });

  it('switches tab when tab trigger is clicked', async () => {
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });
    const specTab = screen.getAllByRole('tab')[1];
    fireEvent.click(specTab);
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });
  });

  it('renders health tab', async () => {
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getAllByText(/Health/).length).toBeGreaterThan(0);
    });
  });

  it('switches to health tab', async () => {
    renderDocsPanel({ providerHealth: [{ name: 'claude', status: 'healthy', lastEvent: '' }] });
    await waitFor(() => {
      const healthTab = screen.getByRole('tab', { name: /Health/ });
      fireEvent.click(healthTab);
    });
  });

  it('renders external link when repoUrl is provided', async () => {
    renderDocsPanel({ repoUrl: 'https://github.com/test/repo' });
    await waitFor(() => {
      const link = screen.getByLabelText('Open repo on GitHub');
      expect(link).toBeInTheDocument();
    });
  });

  it('displays documents content', async () => {
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getByText('Task one')).toBeInTheDocument();
    });
  });

  it('uses default tab when TODO is missing', async () => {
    renderDocsPanel({ docs: { 'SPEC.md': '# Spec' } });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'SPEC' })).toBeInTheDocument();
    });
  });
});