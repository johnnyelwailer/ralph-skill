import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBreakpoint, type Breakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

export interface ResponsiveLayoutContextValue {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (next: boolean) => void;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
}

const ResponsiveLayoutContext = createContext<ResponsiveLayoutContextValue | null>(null);

export interface ResponsiveLayoutProps {
  children: ReactNode;
  className?: string;
}

export function ResponsiveLayout({ children, className }: ResponsiveLayoutProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';
  const [sidebarOpenState, setSidebarOpenState] = useState<boolean>(isDesktop);

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpenState(true);
      return;
    }
    setSidebarOpenState(false);
  }, [isDesktop]);

  const setSidebarOpen = useCallback(
    (next: boolean) => {
      if (isDesktop) {
        setSidebarOpenState(true);
        return;
      }
      setSidebarOpenState(next);
    },
    [isDesktop],
  );

  const toggleSidebar = useCallback(() => {
    if (isDesktop) return;
    setSidebarOpenState((previous) => !previous);
  }, [isDesktop]);

  const openSidebar = useCallback(() => {
    if (isDesktop) return;
    setSidebarOpenState(true);
  }, [isDesktop]);

  const closeSidebar = useCallback(() => {
    if (isDesktop) return;
    setSidebarOpenState(false);
  }, [isDesktop]);

  const value = useMemo<ResponsiveLayoutContextValue>(
    () => ({
      breakpoint,
      isMobile,
      isTablet,
      isDesktop,
      sidebarOpen: sidebarOpenState,
      setSidebarOpen,
      toggleSidebar,
      openSidebar,
      closeSidebar,
    }),
    [breakpoint, closeSidebar, isDesktop, isMobile, isTablet, openSidebar, setSidebarOpen, sidebarOpenState, toggleSidebar],
  );

  return (
    <ResponsiveLayoutContext.Provider value={value}>
      <div className={cn('h-full min-w-0', className)} data-breakpoint={breakpoint}>
        {children}
      </div>
    </ResponsiveLayoutContext.Provider>
  );
}

export function useResponsiveLayout() {
  const context = useContext(ResponsiveLayoutContext);
  if (!context) {
    throw new Error('useResponsiveLayout must be used within <ResponsiveLayout>');
  }
  return context;
}

export function useBreakpointContext(): Breakpoint {
  const { breakpoint } = useResponsiveLayout();
  return breakpoint;
}
