// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsTouchLikePointer } from './useIsTouchLikePointer';

function createMockMatchMedia(matches: boolean) {
  const listeners = new Map<string, (e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '(pointer: coarse)',
    onchange: null,
    addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.set(event, handler);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  return { mql, listeners };
}

describe('useIsTouchLikePointer', () => {
  let listeners: Map<string, (e: MediaQueryListEvent) => void>;
  let mockMql: MediaQueryList;

  beforeEach(() => {
    const mock = createMockMatchMedia(false);
    mockMql = mock.mql;
    listeners = mock.listeners;

    window.matchMedia = vi.fn(() => mockMql);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when pointer is not coarse', () => {
    const { result } = renderHook(() => useIsTouchLikePointer());
    expect(result.current).toBe(false);
  });

  it('returns true when pointer is coarse', () => {
    const mock = createMockMatchMedia(true);
    mockMql = mock.mql;
    listeners = mock.listeners;
    window.matchMedia = vi.fn(() => mockMql);

    const { result } = renderHook(() => useIsTouchLikePointer());
    expect(result.current).toBe(true);
  });

  it('queries the correct media query', () => {
    renderHook(() => useIsTouchLikePointer());
    expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('updates when media query changes', () => {
    const { result } = renderHook(() => useIsTouchLikePointer());
    expect(result.current).toBe(false);

    // Simulate media query change
    const handler = listeners.get('change');
    expect(handler).toBeDefined();
    act(() => {
      handler!({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useIsTouchLikePointer());
    unmount();
    expect(mockMql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
