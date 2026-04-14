import * as React from 'react';

export const TOUCH_MEDIA_QUERY = '(hover: none), (pointer: coarse)';

export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(TOUCH_MEDIA_QUERY).matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(TOUCH_MEDIA_QUERY);
    setIsTouch(mediaQuery.matches);

    const onChange = (event: MediaQueryListEvent) => setIsTouch(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return isTouch;
}
