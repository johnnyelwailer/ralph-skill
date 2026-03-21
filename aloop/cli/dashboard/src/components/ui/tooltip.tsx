import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useIsTouchLikePointer } from '@/hooks/useIsTouchLikePointer';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

type TooltipRootProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;
type TooltipTriggerProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>;

interface TooltipTouchContextValue {
  isTouchLikePointer: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipTouchContext = React.createContext<TooltipTouchContextValue | null>(null);

const Tooltip = ({ open: controlledOpen, defaultOpen, onOpenChange, ...props }: TooltipRootProps) => {
  const isTouchLikePointer = useIsTouchLikePointer();
  const [uncontrolledTouchOpen, setUncontrolledTouchOpen] = React.useState(defaultOpen ?? false);

  React.useEffect(() => {
    if (!isTouchLikePointer) setUncontrolledTouchOpen(false);
  }, [isTouchLikePointer]);

  const effectiveOpen = isTouchLikePointer
    ? (controlledOpen ?? uncontrolledTouchOpen)
    : (controlledOpen ?? undefined);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (isTouchLikePointer && controlledOpen === undefined) {
      setUncontrolledTouchOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }, [controlledOpen, isTouchLikePointer, onOpenChange]);

  const contextValue = React.useMemo(() => ({
    isTouchLikePointer,
    open: Boolean(effectiveOpen),
    setOpen: handleOpenChange,
  }), [effectiveOpen, handleOpenChange, isTouchLikePointer]);

  return (
    <TooltipTouchContext.Provider value={contextValue}>
      <TooltipPrimitive.Root
        {...props}
        defaultOpen={isTouchLikePointer ? undefined : defaultOpen}
        open={effectiveOpen}
        onOpenChange={handleOpenChange}
      />
    </TooltipTouchContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  TooltipTriggerProps
>(({ onClick, ...props }, ref) => {
  const touchContext = React.useContext(TooltipTouchContext);

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (!touchContext?.isTouchLikePointer) return;
    touchContext.setOpen(!touchContext.open);
  }, [onClick, touchContext]);

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
