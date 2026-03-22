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

  function renderHoverCard(props?: Partial<React.ComponentProps<typeof HoverCard>>) {
    return render(
      <HoverCard {...props}>
        <HoverCardTrigger asChild>
          <button type="button">Trigger</button>
        </HoverCardTrigger>
        <HoverCardContent>Hover card content</HoverCardContent>
      </HoverCard>,
    );
  }

  it('toggles hover card open state on tap in touch mode', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    renderHoverCard({ onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not toggle on click in desktop mode', () => {
    mockMatchMedia(false);
    const onOpenChange = vi.fn();

    renderHoverCard({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('supports controlled open prop passthrough', () => {
    mockMatchMedia(true);
    const onOpenChange = vi.fn();

    renderHoverCard({ open: true, onOpenChange });

    expect(screen.getByText('Hover card content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText('Hover card content')).toBeInTheDocument();
  });

  it('respects defaultOpen=true in touch mode', () => {
    mockMatchMedia(true);

    renderHoverCard({ defaultOpen: true });

    expect(screen.getByText('Hover card content')).toBeInTheDocument();
  });
});
