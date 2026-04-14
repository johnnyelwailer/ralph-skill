import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const originalMatchMedia = window.matchMedia;

type ChangeListener = (event: { matches: boolean }) => void;

function createMockMediaQuery(matches: boolean) {
  const listeners: ChangeListener[] = [];
  const mql = {
    matches,
    media: '(hover: none), (pointer: coarse)',
    onchange: null,
    addEventListener: vi.fn((event: string, cb: ChangeListener) => {
      if (event === 'change') listeners.push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: ChangeListener) => {
      if (event === 'change') {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  return { mql, listeners };
}

function installMatchMedia(matches: boolean) {
  const mock = createMockMediaQuery(matches);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue(mock.mql),
  });
  return mock;
}

describe('useIsTouchDevice', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
  });

  it('returns false when window.matchMedia is undefined', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: undefined,
    });

    const { useIsTouchDevice } = await import('./useIsTouchDevice');
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);
  });

  it('returns initial matches=true state', async () => {
    installMatchMedia(true);

    const { useIsTouchDevice } = await import('./useIsTouchDevice');
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
  });

  it('returns initial matches=false state', async () => {
    installMatchMedia(false);

    const { useIsTouchDevice } = await import('./useIsTouchDevice');
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);
  });

  it('updates state when change event fires', async () => {
    const { listeners } = installMatchMedia(false);

    const { useIsTouchDevice } = await import('./useIsTouchDevice');
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);

    act(() => {
      for (const listener of listeners) {
        listener({ matches: true });
      }
    });

    expect(result.current).toBe(true);
  });

  it('cleans up event listener on unmount', async () => {
    const { mql } = installMatchMedia(false);

    const { useIsTouchDevice } = await import('./useIsTouchDevice');
    const { unmount } = renderHook(() => useIsTouchDevice());

    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();

    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    // Verify same callback was used for add and remove
    const addedCb = mql.addEventListener.mock.calls[0][1];
    const removedCb = mql.removeEventListener.mock.calls[0][1];
    expect(addedCb).toBe(removedCb);
  });
});
