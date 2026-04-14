import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBreakpoint } from './useBreakpoint';

// Helper to create a mock MediaQueryList
function createMockMql(matches: boolean) {
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

describe('useBreakpoint', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // jsdom doesn't have matchMedia, define a default mock
    window.matchMedia = vi.fn(() => createMockMql(false));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns "mobile" when viewport < 640px', () => {
    window.matchMedia = vi.fn((query: string) => {
      const isMobileQuery = query.includes('max-width: 639px');
      return createMockMql(isMobileQuery);
    }) as typeof window.matchMedia;

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('mobile');
  });

  it('returns "tablet" when viewport 640-1023px', () => {
    window.matchMedia = vi.fn((query: string) => {
      const isTabletQuery = query.includes('min-width: 640px');
      return createMockMql(isTabletQuery);
    }) as typeof window.matchMedia;

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('tablet');
  });

  it('returns "desktop" when viewport >= 1024px', () => {
    window.matchMedia = vi.fn(() => createMockMql(false)) as typeof window.matchMedia;

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('desktop');
  });

  it('updates when breakpoint changes', () => {
    const changeHandlers: Array<() => void> = [];
    const mobileMql = createMockMql(false);
    const tabletMql = createMockMql(false);

    window.matchMedia = vi.fn((query: string) => {
      const isMobileQuery = query.includes('max-width: 639px');
      const mql = isMobileQuery ? mobileMql : tabletMql;
      mql.addEventListener = vi.fn((_, handler) => {
        changeHandlers.push(handler as () => void);
      });
      return mql;
    }) as typeof window.matchMedia;

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('desktop');

    // Simulate resize to mobile
    act(() => {
      (mobileMql as any).matches = true;
      (tabletMql as any).matches = false;
      changeHandlers.forEach((h) => h());
    });
    expect(result.current).toBe('mobile');
  });

  it('cleans up listeners on unmount', () => {
    const removeFns = [vi.fn(), vi.fn()];
    let callIndex = 0;

    window.matchMedia = vi.fn(() => {
      const mql = createMockMql(false);
      const fn = removeFns[callIndex++];
      mql.removeEventListener = fn as typeof mql.removeEventListener;
      return mql;
    }) as typeof window.matchMedia;

    const { unmount } = renderHook(() => useBreakpoint());
    unmount();

    expect(removeFns[0]).toHaveBeenCalled();
    expect(removeFns[1]).toHaveBeenCalled();
  });
});
