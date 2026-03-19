/**
 * CLAUDECODE Environment Variable Sanitization
 * 
 * When aloop is invoked from inside a Claude Code session, the CLAUDECODE env var is set.
 * This causes the Claude CLI provider to refuse to start: "Claude Code cannot be launched 
 * inside another Claude Code session."
 * 
 * This module unsets CLAUDECODE at process entry to ensure sub-processes can launch
 * Claude Code and other providers without interference.
 */

if (process.env.CLAUDECODE) {
  delete process.env.CLAUDECODE;
}
