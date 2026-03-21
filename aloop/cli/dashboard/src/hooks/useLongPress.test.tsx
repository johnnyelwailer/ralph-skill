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

  it('does not fire onLongPress if touchEnd occurs before delay', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
    vi.advanceTimersByTime(300);
    fireEvent.touchEnd(target);
    vi.advanceTimersByTime(300);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores multi-touch (2+ fingers) on touchStart', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, {
      touches: [
        { clientX: 10, clientY: 10 },
        { clientX: 50, clientY: 50 },
      ],
    });
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels long press on touchCancel', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
    vi.advanceTimersByTime(200);
    fireEvent.touchCancel(target);
    vi.advanceTimersByTime(400);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('suppresses click after long-press fires', () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    function TestWithClick({ onLongPress: lp }: { onLongPress: typeof onLongPress }) {
      const handlers = useLongPress<HTMLDivElement>({ onLongPress: lp, delayMs: 500 });
      return <div data-testid="target" {...handlers} onClick={onClick}>target</div>;
    }
    const { getByTestId } = render(<TestWithClick onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    // The click after long-press should be suppressed
    fireEvent.click(target);
    expect(onClick).not.toHaveBeenCalled();

    // Second click should pass through (suppressClick resets)
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not suppress click when no long-press was triggered', () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    function TestWithClick({ onLongPress: lp }: { onLongPress: typeof onLongPress }) {
      const handlers = useLongPress<HTMLDivElement>({ onLongPress: lp, delayMs: 500 });
      return <div data-testid="target" {...handlers} onClick={onClick}>target</div>;
    }
    const { getByTestId } = render(<TestWithClick onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('handles touchMove with no prior touchStart gracefully', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    // touchMove without touchStart — startRef.current is null
    fireEvent.touchMove(target, { touches: [{ clientX: 50, clientY: 50 }] });
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('handles clearPress when no timeout is pending', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    // touchEnd without touchStart — clearPress with no timeout pending
    fireEvent.touchEnd(target);
    fireEvent.touchCancel(target);

    // No errors thrown
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores touchMove with multi-touch', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<TestTarget onLongPress={onLongPress} />);
    const target = getByTestId('target');

    fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
    // touchMove with 2 fingers — should be ignored (early return)
    fireEvent.touchMove(target, {
      touches: [
        { clientX: 50, clientY: 50 },
        { clientX: 60, clientY: 60 },
      ],
    });
    vi.advanceTimersByTime(500);

    // Long press should still fire since multi-touch move was ignored
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
