// agent.js: Minimal aloop sandbox agent
// Reads work payload from stdin (JSON), executes provider, outputs result (JSON)
// For spike: mocks provider calls and logs to stdout

const readline = require('readline');

const VERSION = '0.1.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const log = {
  info: (msg, data) => console.error(`[${new Date().toISOString()}] INFO: ${msg}`, data || ''),
  debug: (msg, data) => LOG_LEVEL === 'debug' && console.error(`[${new Date().toISOString()}] DEBUG: ${msg}`, data || ''),
  error: (msg, data) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, data || ''),
};

// Mock provider execution
async function executeProvider(provider, prompt) {
  log.debug('executeProvider', { provider, prompt });

  // Simulate work delay
  await new Promise(r => setTimeout(r, 100));

  // Mock responses by provider
  const responses = {
    'test': () => `Mock response to "${prompt}" from provider: ${provider}`,
    'opencode': () => `Executed with OpenCode: ${prompt}`,
    'anthropic': () => `Anthropic response: ${prompt}`,
    'openai': () => `OpenAI response: ${prompt}`,
  };

  const handler = responses[provider] || (() => `Unknown provider: ${provider}`);
  return handler();
}

// Main agent loop
async function main() {
  log.info(`aloop sandbox agent v${VERSION} starting`, { pid: process.pid });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let lineCount = 0;

  for await (const line of rl) {
    lineCount++;
    log.debug('received line', { lineCount, lineContent: line.substring(0, 100) });

    try {
      const workPayload = JSON.parse(line);
      const { provider, prompt, taskId } = workPayload;

      if (!provider || !prompt) {
        const error = 'Missing required fields: provider, prompt';
        log.error(error);
        console.log(
          JSON.stringify({
            taskId: taskId || 'unknown',
            status: 'error',
            error,
            timestamp: new Date().toISOString(),
          })
        );
        continue;
      }

      log.info('processing work', { provider, taskId, promptLength: prompt.length });

      const result = await executeProvider(provider, prompt);

      const response = {
        taskId: taskId || `task-${lineCount}`,
        provider,
        status: 'success',
        result,
        executedAt: new Date().toISOString(),
      };

      // Output result as JSON line
      console.log(JSON.stringify(response));
      log.info('work completed', { taskId });
    } catch (err) {
      const taskId = `task-${lineCount}`;
      log.error('work execution failed', { error: err.message, taskId });
      console.log(
        JSON.stringify({
          taskId,
          status: 'error',
          error: err.message,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  log.info('agent exiting gracefully');
  process.exit(0);
}

// Handle signals
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('SIGINT received, shutting down');
  process.exit(0);
});

main().catch((err) => {
  log.error('fatal error', { error: err.message });
  process.exit(1);
});
