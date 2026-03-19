import { resolveHomeDir, stopSession } from './session.js';
import type { OutputMode } from './status.js';

export interface StopCommandOptions {
  homeDir?: string;
  output?: OutputMode;
}

export async function stopCommand(sessionId: string, options: StopCommandOptions = {}) {
  const outputMode = options.output || 'text';
  const homeDir = resolveHomeDir(options.homeDir);
  const result = await stopSession(homeDir, sessionId);

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exit(1);
    return;
  }

  if (!result.success) {
    console.error(result.reason);
    process.exit(1);
  }

  console.log(`Session ${sessionId} stopped.`);
}
