import { useEffect, useState } from 'react';

/**
 * Detects whether the primary pointer is touch-like (coarse) using the
 * `pointer: coarse` media query. Reacts to runtime changes (e.g. toggling
 * device emulation in DevTools or connecting a stylus).
 *
 * Returns `true` on touch-primary devices (phones, tablets), `false` on
 * mouse/trackpad-primary devices. During SSR it defaults to `false`.
 */
export function useIsTouchLikePointer(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mql.addEventListener('change', handler);
    // Sync in case the value changed between initial render and effect
    setIsTouch(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isTouch;
}
