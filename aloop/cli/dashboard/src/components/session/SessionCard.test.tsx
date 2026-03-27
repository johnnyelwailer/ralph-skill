import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionCard } from './SessionCard';
import type { SessionSummary } from '@/lib/types';

const originalMatchMedia = window.matchMedia;

function mockTouchDevice() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: true,
      media: '(hover: none), (pointer: coarse)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const baseSession: SessionSummary = {
  id: 'sess-001',
  name: 'Test Session',
  projectName: 'my-project',
  status: 'running',
  phase: 'build',
  elapsed: '5m',
  iterations: '3',
  isActive: true,
  branch: 'main',
  startedAt: '2024-01-01T00:00:00Z',
  endedAt: '',
  pid: '12345',
  provider: 'claude',
  workDir: '/home/user/project',
  stuckCount: 0,
};

function renderCard(
  overrides: Partial<SessionSummary> = {},
  props: {
    cardCost?: number | null;
    isSelected?: boolean;
    costUnavailable?: boolean;
    suppressClick?: boolean;
    onSelect?: () => void;
    onOpenContextMenu?: (x: number, y: number) => void;
    onClearSuppressClick?: () => void;
  } = {},
) {
  const session = { ...baseSession, ...overrides };
  return render(
    <TooltipProvider>
      <SessionCard
        session={session}
        cardCost={props.cardCost ?? null}
        isSelected={props.isSelected ?? false}
        costUnavailable={props.costUnavailable ?? false}
        suppressClick={props.suppressClick ?? false}
        onSelect={props.onSelect ?? vi.fn()}
        onOpenContextMenu={props.onOpenContextMenu ?? vi.fn()}
        onClearSuppressClick={props.onClearSuppressClick ?? vi.fn()}
      />
    </TooltipProvider>,
  );
}

describe('SessionCard', () => {
  it('renders session name', () => {
    renderCard();
    expect(screen.getByText('Test Session')).toBeInTheDocument();
  });

  describe('click behaviour', () => {
    it('calls onSelect when suppressClick is false', () => {
      const onSelect = vi.fn();
      const onClearSuppressClick = vi.fn();
      renderCard({}, { onSelect, onClearSuppressClick, suppressClick: false });

      fireEvent.click(screen.getByRole('button'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onClearSuppressClick).not.toHaveBeenCalled();
    });

    it('calls onClearSuppressClick and skips onSelect when suppressClick is true', () => {
      const onSelect = vi.fn();
      const onClearSuppressClick = vi.fn();
      renderCard({}, { onSelect, onClearSuppressClick, suppressClick: true });

      fireEvent.click(screen.getByRole('button'));

      expect(onClearSuppressClick).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('cardCost display', () => {
    it('shows formatted cost in card when cardCost is a number', () => {
      renderCard({}, { cardCost: 0.1234 });
      expect(screen.getByText(/\$0\.1234/)).toBeInTheDocument();
    });

    it('does not show cost in card when cardCost is null', () => {
      const { container } = renderCard({}, { cardCost: null });
      expect(container.querySelector('span')).not.toHaveTextContent(/\$/);
    });

    it('formats cardCost to 4 decimal places', () => {
      renderCard({}, { cardCost: 1.5 });
      expect(screen.getByText(/\$1\.5000/)).toBeInTheDocument();
    });
  });

  describe('tooltip content', () => {
    beforeEach(() => {
      mockTouchDevice();
      vi.useFakeTimers();
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    // Open tooltip by clicking (touch mode toggles tooltip on click).
    // Do NOT advance timers after clicking — that would fire the 2 s auto-close timer.
    function openTooltip() {
      fireEvent.click(screen.getByRole('button'));
    }

    it('shows session id in tooltip', () => {
      renderCard();
      openTooltip();
      expect(screen.getByRole('tooltip')).toHaveTextContent('sess-001');
    });

    it('shows "Cost: unavailable" in tooltip when costUnavailable is true and cardCost is null', () => {
      renderCard({}, { costUnavailable: true, cardCost: null });
      openTooltip();
      expect(screen.getByRole('tooltip')).toHaveTextContent('Cost: unavailable');
    });

    it('does not show "Cost: unavailable" when cardCost is provided', () => {
      renderCard({}, { costUnavailable: true, cardCost: 0.5 });
      openTooltip();
      expect(screen.getByRole('tooltip')).not.toHaveTextContent('Cost: unavailable');
    });

    it('shows formatted cost in tooltip when cardCost is a number', () => {
      renderCard({}, { cardCost: 0.0042 });
      openTooltip();
      expect(screen.getByRole('tooltip')).toHaveTextContent('Cost: $0.0042');
    });

    it('shows red stuck text in tooltip when stuckCount > 0', () => {
      renderCard({ stuckCount: 2 });
      openTooltip();
      const tooltip = screen.getByRole('tooltip');
      const stuckEl = Array.from(tooltip.querySelectorAll('p')).find((p) =>
        p.textContent?.includes('Stuck'),
      );
      expect(stuckEl).toBeTruthy();
      expect(stuckEl?.classList.contains('text-red-500')).toBe(true);
    });

    it('does not show stuck text in tooltip when stuckCount is 0', () => {
      renderCard({ stuckCount: 0 });
      openTooltip();
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).not.toHaveTextContent('Stuck');
    });
  });
});
