import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    const user = userEvent.setup();
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getAllByRole('tab')).toHaveLength(4);
    });
    const specTab = screen.getAllByRole('tab')[1];
    await user.click(specTab);
    await waitFor(() => {
      expect(specTab).toHaveAttribute('data-state', 'active');
    });
  });

  it('renders health tab', async () => {
    renderDocsPanel();
    await waitFor(() => {
      expect(screen.getAllByText(/Health/).length).toBeGreaterThan(0);
    });
  });

  it('switches to health tab', async () => {
    const user = userEvent.setup();
    renderDocsPanel({ providerHealth: [{ name: 'claude', status: 'healthy', lastEvent: '' }] });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Health/ })).toBeInTheDocument();
    });
    const healthTab = screen.getByRole('tab', { name: /Health/i });
    await user.click(healthTab);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Health/i })).toHaveAttribute('data-state', 'active');
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

  it('resets activeTab to defaultTab when active tab is removed from docs', async () => {
    const { rerender } = render(
      <TooltipProvider>
        <div className="h-[400px] w-[300px]">
          <DocsPanel {...defaultProps} docs={{ 'TODO.md': '# TODO', 'SPEC.md': '# Spec' }} />
        </div>
      </TooltipProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'TODO' })).toHaveAttribute('data-state', 'active');
    });
    rerender(
      <TooltipProvider>
        <div className="h-[400px] w-[300px]">
          <DocsPanel {...defaultProps} docs={{ 'SPEC.md': '# Spec' }} />
        </div>
      </TooltipProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'SPEC' })).toHaveAttribute('data-state', 'active');
    });
  });
});