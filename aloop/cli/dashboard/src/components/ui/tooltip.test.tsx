import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('opens tooltip on tap in touch mode and auto closes', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    render(
      <TooltipProvider>
        <Tooltip onOpenChange={onOpenChange}>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Tap tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByText('Trigger'));

    expect(onOpenChange).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(2000);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
