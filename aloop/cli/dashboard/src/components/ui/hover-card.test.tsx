import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

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

describe('HoverCard touch behavior', () => {
  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
  });

  it('toggles hover card open state on tap in touch mode', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    render(
      <HoverCard onOpenChange={onOpenChange}>
        <HoverCardTrigger asChild>
          <button type="button">Trigger</button>
        </HoverCardTrigger>
        <HoverCardContent>Hover card content</HoverCardContent>
      </HoverCard>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
