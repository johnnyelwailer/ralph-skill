import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
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

describe('Tooltip touch behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function renderTooltip(props?: Partial<React.ComponentProps<typeof Tooltip>>) {
    return render(
      <TooltipProvider>
        <Tooltip {...props}>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Tap tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
  }

  it('opens tooltip on tap in touch mode and auto closes', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    renderTooltip({ onOpenChange });

    fireEvent.click(screen.getByText('Trigger'));

    expect(onOpenChange).toHaveBeenCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on second tap in touch mode', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    renderTooltip({ onOpenChange });
    const trigger = screen.getByText('Trigger');

    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenNthCalledWith(1, true);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
  });

  it('does not toggle on click in desktop mode', () => {
    mockMatchMedia(false);
    const onOpenChange = vi.fn();

    renderTooltip({ onOpenChange });
    fireEvent.click(screen.getByText('Trigger'));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('supports controlled open prop passthrough', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    renderTooltip({ open: true, onOpenChange });
    const trigger = screen.getByText('Trigger');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tap tooltip');

    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tap tooltip');
  });

  it('respects defaultOpen=true in touch mode', () => {
    mockMatchMedia(true);

    renderTooltip({ defaultOpen: true });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Tap tooltip');
  });
});
