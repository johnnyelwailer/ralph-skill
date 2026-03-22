import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const TOUCH_TOOLTIP_AUTO_CLOSE_MS = 2000;
const TOUCH_MEDIA_QUERY = '(hover: none), (pointer: coarse)';

interface TooltipTouchContextValue {
  isTouch: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
}

const TooltipTouchContext = React.createContext<TooltipTouchContextValue | null>(null);

function useIsTouchDevice() {
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

const Tooltip = ({
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => {
  const isTouch = useIsTouchDevice();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (!isTouch || !open) {
      return;
    }
    const timer = window.setTimeout(() => handleOpenChange(false), TOUCH_TOOLTIP_AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [isTouch, open, handleOpenChange]);

  const contextValue = React.useMemo(
    () => ({ isTouch, open, setOpen: handleOpenChange }),
    [handleOpenChange, isTouch, open],
  );

  return (
    <TooltipTouchContext.Provider value={contextValue}>
      <TooltipPrimitive.Root
        {...props}
        open={isTouch ? open : openProp}
        defaultOpen={isTouch ? undefined : defaultOpen}
        onOpenChange={isTouch ? handleOpenChange : onOpenChange}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipTouchContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onClick, ...props }, ref) => {
  const touchContext = React.useContext(TooltipTouchContext);
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || !touchContext?.isTouch) {
        return;
      }
      touchContext.setOpen(!touchContext.open);
    },
    [onClick, touchContext],
  );

  return <TooltipPrimitive.Trigger ref={ref} onClick={handleClick} {...props} />;
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
