import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ghCommand } from './gh.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ghCommand', () => {
  let tmpHome: string;
  let sessionDir: string;
  let requestFile: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aloop-gh-test-'));
    sessionDir = path.join(tmpHome, '.aloop', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    
    requestFile = path.join(tmpHome, 'request.json');
    fs.writeFileSync(requestFile, JSON.stringify({
      type: 'pr-create',
      repo: 'test/repo',
      labels: ['aloop/auto']
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('should allow child-loop to create PRs and log gh_operation', async () => {
    // We override process.exit to prevent the test from exiting,
    // and console.log/error to capture output
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    await ghCommand.parseAsync([
      'node', 'test', 'pr-create',
      '--session', 'test-session',
      '--request', requestFile,
      '--role', 'child-loop',
      '--home-dir', tmpHome
    ]);

    const logFile = path.join(sessionDir, 'log.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const logs = fs.readFileSync(logFile, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map(line => JSON.parse(line));
    expect(logs.length).toBe(1);
    expect(logs[0].event).toBe('gh_operation');
    expect(logs[0].type).toBe('pr-create');
    expect(logs[0].role).toBe('child-loop');
    expect(logs[0].result).toBe('success');
    expect(logs[0].enforced.base).toBe('agent/trunk');

    mockExit.mockRestore();
    mockLog.mockRestore();
  });

  it('should deny child-loop from merging PRs and log gh_operation_denied', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await ghCommand.parseAsync([
      'node', 'test', 'pr-merge',
      '--session', 'test-session',
      '--request', requestFile,
      '--role', 'child-loop',
      '--home-dir', tmpHome
    ]);

    const logFile = path.join(sessionDir, 'log.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const logs = fs.readFileSync(logFile, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map(line => JSON.parse(line));
    expect(logs.length).toBe(1);
    expect(logs[0].event).toBe('gh_operation_denied');
    expect(logs[0].type).toBe('pr-merge');
    expect(logs[0].role).toBe('child-loop');
    expect(logs[0].reason).toContain('not allowed');

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('should allow orchestrator to merge PRs', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    await ghCommand.parseAsync([
      'node', 'test', 'pr-merge',
      '--session', 'test-session',
      '--request', requestFile,
      '--role', 'orchestrator',
      '--home-dir', tmpHome
    ]);

    const logFile = path.join(sessionDir, 'log.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const logs = fs.readFileSync(logFile, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map(line => JSON.parse(line));
    expect(logs.length).toBe(1);
    expect(logs[0].event).toBe('gh_operation');
    expect(logs[0].enforced.merge_method).toBe('squash');

    mockExit.mockRestore();
    mockLog.mockRestore();
  });
});