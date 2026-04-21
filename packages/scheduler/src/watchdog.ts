export type RunningWatchdog = {
  stop(): void;
};

export type StartSchedulerWatchdogInput = {
  tickIntervalSeconds(): number;
  expirePermits(): Promise<number>;
};

export function startSchedulerWatchdog(input: StartSchedulerWatchdogInput): RunningWatchdog {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const scheduleTick = (): void => {
    if (stopped) return;
    const delayMs = Math.max(1000, input.tickIntervalSeconds() * 1000);
    timer = setTimeout(() => {
      input
        .expirePermits()
        .catch(() => {})
        .finally(() => {
          scheduleTick();
        });
    }, delayMs);
  };

  scheduleTick();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
