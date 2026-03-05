import { resolveHomeDir, listActiveSessions } from './session.js';
import { formatRelativeTime, type OutputMode } from './status.js';

export interface ActiveCommandOptions {
  homeDir?: string;
  output?: OutputMode;
}

export async function activeCommand(options: ActiveCommandOptions = {}) {
  const outputMode = options.output || 'text';
  const homeDir = resolveHomeDir(options.homeDir);
  const sessions = await listActiveSessions(homeDir);

  if (outputMode === 'json') {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log('No active sessions.');
    return;
  }

  for (const s of sessions) {
    const age = formatRelativeTime(s.started_at);
    console.log(`${s.session_id}  pid=${s.pid ?? 'n/a'}  ${s.state}  ${s.work_dir ?? ''}  (${age})`);
  }
}
