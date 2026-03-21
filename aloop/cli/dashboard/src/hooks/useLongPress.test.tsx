import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLongPress } from './useLongPress';

function TestTarget({ onLongPress }: { onLongPress: (point: { clientX: number; clientY: number }, target: HTMLDivElement) => void }) {
  const handlers = useLongPress<HTMLDivElement>({ onLongPress, delayMs: 500 });
  return <div data-testid="target" {...handlers}>target</div>;
}

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onLongPress after 500ms with touch position', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, { touches: [{ clientX: 15, clientY: 25 }] });
    vi.advanceTimersByTime(500);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    const [point, node] = onLongPress.mock.calls[0];
    expect(point).toEqual({ clientX: 15, clientY: 25 });
    expect(node).toBe(target);
  });

  it('cancels long press when finger moves beyond threshold', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchMove(target, { touches: [{ clientX: 30, clientY: 30 }] });
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
