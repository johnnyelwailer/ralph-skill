import { useEffect, useState } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const MOBILE_MAX = 640;
export const TABLET_MAX = 1024;

function getBreakpoint(width: number): Breakpoint {
  if (width < MOBILE_MAX) return 'mobile';
  if (width < TABLET_MAX) return 'tablet';
  return 'desktop';
}

/**
 * React hook that returns the current breakpoint based on viewport width.
 * Uses matchMedia listeners for efficient updates.
 *
 * Breakpoints (aligned with Tailwind defaults):
 * - mobile:  < 640px
 * - tablet:  640px – 1023px
 * - desktop: >= 1024px
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'desktop',
  );

  useEffect(() => {
    const mqMobile = window.matchMedia(`(max-width: ${MOBILE_MAX - 1}px)`);
    const mqTablet = window.matchMedia(
      `(min-width: ${MOBILE_MAX}px) and (max-width: ${TABLET_MAX - 1}px)`,
    );

    function update() {
      if (mqMobile.matches) {
        setBreakpoint('mobile');
      } else if (mqTablet.matches) {
        setBreakpoint('tablet');
      } else {
        setBreakpoint('desktop');
      }
    }

    // Set initial value
    update();

    mqMobile.addEventListener('change', update);
    mqTablet.addEventListener('change', update);

    return () => {
      mqMobile.removeEventListener('change', update);
      mqTablet.removeEventListener('change', update);
    };
  }, []);

  return breakpoint;
}
