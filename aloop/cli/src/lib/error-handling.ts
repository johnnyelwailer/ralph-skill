type OutputMode = 'json' | 'text';

function isOutputMode(value: unknown): value is OutputMode {
  return value === 'json' || value === 'text';
}

export function resolveOutputModeFromActionArgs(args: any[]): OutputMode {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    const arg = args[i];
    if (!arg || typeof arg !== 'object') {
      continue;
    }

    if ('output' in arg && isOutputMode(arg.output)) {
      return arg.output;
    }

    if ('opts' in arg && typeof arg.opts === 'function') {
      const opts = arg.opts();
      if (opts && typeof opts === 'object' && 'output' in opts && isOutputMode(opts.output)) {
        return opts.output;
      }
    }
  }

  return 'text';
}

export function resolveOutputModeFromArgv(argv: string[]): OutputMode {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextArg = argv[i + 1];
    if (arg === '--output' && isOutputMode(nextArg)) {
      return nextArg;
    }

    if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length);
      if (isOutputMode(value)) {
        return value;
      }
    }
  }

  return 'text';
}

function formatErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
    return error.stderr.trim();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function emitError(message: string, outputMode: OutputMode): void {
  if (outputMode === 'json') {
    console.error(JSON.stringify({ error: message }));
    return;
  }
  console.error(`Error: ${message}`);
}

export function withErrorHandling(action: (...args: any[]) => Promise<void> | void) {
  return async (...args: any[]) => {
    try {
      await action(...args);
    } catch (error) {
      emitError(formatErrorMessage(error), resolveOutputModeFromActionArgs(args));
      process.exit(1);
    }
  };
}
