import { resolveHomeDir, listActiveSessions, readProviderHealth } from './session.js';

export type OutputMode = 'json' | 'text';

export interface StatusCommandOptions {
  homeDir?: string;
  output?: OutputMode;
}

export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return 'unknown';
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function formatHealthLine(provider: string, health: any): string {
  const status = health.status ?? 'unknown';
  let detail = '';
  if (status === 'cooldown' && health.cooldown_until) {
    const resumeMs = new Date(health.cooldown_until).getTime() - Date.now();
    if (resumeMs > 0) {
      const mins = Math.ceil(resumeMs / 60000);
      const failures = health.consecutive_failures ?? 0;
      detail = `(${failures} failure${failures !== 1 ? 's' : ''}, resumes in ${mins}m)`;
    }
  } else if (status === 'degraded' && health.failure_reason) {
    const hints: Record<string, string> = { auth: 'auth error — run `gh auth login`' };
    detail = `(${hints[health.failure_reason] ?? health.failure_reason})`;
  } else if (status === 'healthy' && health.last_success) {
    detail = `(last success: ${formatRelativeTime(health.last_success)})`;
  }
  return `  ${provider.padEnd(10)} ${status.padEnd(12)} ${detail}`.trimEnd();
}

export async function statusCommand(options: StatusCommandOptions = {}) {
  const outputMode = options.output || 'text';
  const homeDir = resolveHomeDir(options.homeDir);
  const sessions = await listActiveSessions(homeDir);
  const health = await readProviderHealth(homeDir);

  if (outputMode === 'json') {
    console.log(JSON.stringify({ sessions, health }, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log('No active sessions.');
  } else {
    console.log('Active Sessions:');
    for (const s of sessions) {
      const age = formatRelativeTime(s.started_at);
      const iter = s.iteration != null ? `iter ${s.iteration}` : '';
      const phase = s.phase ?? '';
      const detail = [iter, phase].filter(Boolean).join(', ');
      console.log(`  ${s.session_id}  pid=${s.pid ?? 'n/a'}  ${s.state}  ${detail}  (${age})`);
      if (s.work_dir) console.log(`    workdir: ${s.work_dir}`);
    }
  }

  const healthEntries = Object.entries(health);
  if (healthEntries.length > 0) {
    console.log('');
    console.log('Provider Health:');
    for (const [provider, data] of healthEntries) {
      console.log(formatHealthLine(provider, data));
    }
  }
}
