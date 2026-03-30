import { isRecord, str } from './activityLogHelpers';
import { parseDurationSeconds, formatSecs } from './format';

export function computeAvgDuration(log: string): string {
  if (!log) return '';
  let totalSec = 0;
  let count = 0;
  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (!isRecord(obj)) continue;
      const event = str(obj, ['event']);
      if (event !== 'iteration_complete') continue;
      const dur = str(obj, ['duration', 'elapsed', 'took']);
      const secs = parseDurationSeconds(dur);
      if (secs !== null && secs > 0) {
        totalSec += secs;
        count++;
      }
    } catch { /* skip */ }
  }
  if (count === 0) return '';
  return formatSecs(totalSec / count);
}

export function latestQaCoverageRefreshSignal(log: string): string | null {
  if (!log) return null;
  const lines = log.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (!isRecord(entry)) continue;
      const event = str(entry, ['event', 'type']);
      const phase = str(entry, ['phase', 'mode']).toLowerCase();
      if (event !== 'iteration_complete' || phase !== 'qa') continue;
      const timestamp = str(entry, ['timestamp', 'ts', 'time', 'created_at']);
      const iterationRaw = entry.iteration;
      const iteration = typeof iterationRaw === 'number' ? String(iterationRaw)
        : typeof iterationRaw === 'string' ? iterationRaw : '';
      return `${timestamp}|${iteration}|${line}`;
    } catch {
      // Skip non-JSON lines in log stream.
    }
  }
  return null;
}
