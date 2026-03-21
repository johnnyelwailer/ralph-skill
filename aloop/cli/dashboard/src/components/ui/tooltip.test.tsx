import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const mockIsTouchLikePointer = vi.fn(() => false);

vi.mock('@/hooks/useIsTouchLikePointer', () => ({
  useIsTouchLikePointer: () => mockIsTouchLikePointer(),
}));

describe('Tooltip touch behavior', () => {
  beforeEach(() => {
    mockIsTouchLikePointer.mockReset();
    mockIsTouchLikePointer.mockReturnValue(false);
  });

  it('opens and closes on tap for touch-like pointers', async () => {
    mockIsTouchLikePointer.mockReturnValue(true);

    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Tap me</TooltipTrigger>
          <TooltipContent>Touch tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Tap me' });

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument());

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('preserves trigger onClick handlers on touch-like pointers', () => {
    mockIsTouchLikePointer.mockReturnValue(true);
    const onClick = vi.fn();

    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger onClick={onClick}>Tap me</TooltipTrigger>
          <TooltipContent>Touch tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tap me' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
