import * as React from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '@/lib/utils';

const TOUCH_MEDIA_QUERY = '(hover: none), (pointer: coarse)';

interface HoverCardTouchContextValue {
  isTouch: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
}

const HoverCardTouchContext = React.createContext<HoverCardTouchContextValue | null>(null);

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

const HoverCard = ({
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Root>) => {
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

  const contextValue = React.useMemo(
    () => ({ isTouch, open, setOpen: handleOpenChange }),
    [handleOpenChange, isTouch, open],
  );

  return (
    <HoverCardTouchContext.Provider value={contextValue}>
      <HoverCardPrimitive.Root
        {...props}
        open={isTouch ? open : openProp}
        defaultOpen={isTouch ? undefined : defaultOpen}
        onOpenChange={isTouch ? handleOpenChange : onOpenChange}
      >
        {children}
      </HoverCardPrimitive.Root>
    </HoverCardTouchContext.Provider>
  );
};

const HoverCardTrigger = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>
>(({ onClick, ...props }, ref) => {
  const touchContext = React.useContext(HoverCardTouchContext);
  const handleClick: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>['onClick'] = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || !touchContext?.isTouch) {
        return;
      }
      touchContext.setOpen(!touchContext.open);
    },
    [onClick, touchContext],
  );

  return <HoverCardPrimitive.Trigger ref={ref} onClick={handleClick} {...props} />;
});
HoverCardTrigger.displayName = HoverCardPrimitive.Trigger.displayName;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      'z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className,
    )}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
