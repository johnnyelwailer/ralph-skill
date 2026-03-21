import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from './useLongPress';

function pointerEvent(overrides: Partial<PointerEvent> = {}) {
  return {
    button: 0,
    clientX: 10,
    clientY: 20,
    isPrimary: true,
    pointerType: 'touch',
    target: document.body,
    ...overrides,
  };
}

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires onLongPress after delay', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ delay: 300, onLongPress }));

    act(() => {
      result.current.bind.onPointerDown(pointerEvent() as never);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(
      expect.objectContaining({
        clientX: 10,
        clientY: 20,
        pointerType: 'touch',
      }),
    );
  });

  it('cancels when moved beyond tolerance', () => {
    const onLongPress = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() =>
      useLongPress({ delay: 300, moveTolerance: 8, onCancel, onLongPress }),
    );

    act(() => {
      result.current.bind.onPointerDown(pointerEvent({ clientX: 10, clientY: 10 }) as never);
      result.current.bind.onPointerMove(pointerEvent({ clientX: 25, clientY: 10 }) as never);
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on scroll before delay', () => {
    const onLongPress = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useLongPress({ delay: 300, onCancel, onLongPress }));

    act(() => {
      result.current.bind.onPointerDown(pointerEvent() as never);
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when released early', () => {
    const onLongPress = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useLongPress({ delay: 300, onCancel, onLongPress }));

    act(() => {
      result.current.bind.onPointerDown(pointerEvent() as never);
      result.current.bind.onPointerUp(pointerEvent() as never);
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not start when disabled', () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ delay: 300, disabled: true, onLongPress }));

    act(() => {
      result.current.bind.onPointerDown(pointerEvent() as never);
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.isPressing).toBe(false);
  });
});
