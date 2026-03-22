export function withErrorHandling(action: (...args: any[]) => Promise<void> | void) {
  return async (...args: any[]) => {
    try {
      await action(...args);
    } catch (error) {
      if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
        console.error(`Error: ${error.stderr.trim()}`);
      } else if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error(`Error: ${String(error)}`);
      }
      process.exit(1);
    }
  };
}
