import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ResponsiveLayout, useResponsiveLayout, useBreakpointContext } from './ResponsiveLayout';
import type { Breakpoint } from '@/hooks/useBreakpoint';

let mockedBreakpoint: Breakpoint = 'desktop';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockedBreakpoint,
}));

function withResponsiveLayout(children: ReactNode) {
  return <ResponsiveLayout>{children}</ResponsiveLayout>;
}

describe('ResponsiveLayout', () => {
  it('exposes desktop context with sidebar always open', () => {
    mockedBreakpoint = 'desktop';
    const { result } = renderHook(() => useResponsiveLayout(), {
      wrapper: ({ children }) => withResponsiveLayout(children),
    });

    expect(result.current.breakpoint).toBe('desktop');
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.sidebarOpen).toBe(true);

    act(() => {
      result.current.toggleSidebar();
      result.current.closeSidebar();
      result.current.setSidebarOpen(false);
    });

    expect(result.current.sidebarOpen).toBe(true);
  });

  it('starts with sidebar closed on tablet and toggles open/closed', () => {
    mockedBreakpoint = 'tablet';
    const { result } = renderHook(() => useResponsiveLayout(), {
      wrapper: ({ children }) => withResponsiveLayout(children),
    });

    expect(result.current.breakpoint).toBe('tablet');
    expect(result.current.isTablet).toBe(true);
    expect(result.current.sidebarOpen).toBe(false);

    act(() => {
      result.current.openSidebar();
    });
    expect(result.current.sidebarOpen).toBe(true);

    act(() => {
      result.current.toggleSidebar();
    });
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('resets sidebar when breakpoint changes to desktop', () => {
    mockedBreakpoint = 'tablet';
    const { result, rerender } = renderHook(() => useResponsiveLayout(), {
      wrapper: ({ children }) => withResponsiveLayout(children),
    });

    act(() => {
      result.current.openSidebar();
    });
    expect(result.current.sidebarOpen).toBe(true);

    mockedBreakpoint = 'desktop';
    rerender();

    expect(result.current.isDesktop).toBe(true);
    expect(result.current.sidebarOpen).toBe(true);
  });

  it('useBreakpointContext returns the current breakpoint', () => {
    mockedBreakpoint = 'mobile';
    const { result, rerender } = renderHook(() => useBreakpointContext(), {
      wrapper: ({ children }) => withResponsiveLayout(children),
    });

    expect(result.current).toBe('mobile');

    mockedBreakpoint = 'tablet';
    rerender();
    expect(result.current).toBe('tablet');

    mockedBreakpoint = 'desktop';
    rerender();
    expect(result.current).toBe('desktop');
  });
});
