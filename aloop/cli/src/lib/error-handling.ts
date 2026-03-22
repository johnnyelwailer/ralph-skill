export function withErrorHandling(action: (...args: any[]) => Promise<void> | void) {
  return async (...args: any[]) => {
    try {
      await action(...args);
    } catch (error) {
      let message: string;
      if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
        message = error.stderr.trim();
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }

      const outputMode = args[0]?.output;
      if (outputMode === 'json') {
        console.log(JSON.stringify({ success: false, error: message }));
      } else {
        console.error(`Error: ${message}`);
      }
      process.exit(1);
    }
  };
}
