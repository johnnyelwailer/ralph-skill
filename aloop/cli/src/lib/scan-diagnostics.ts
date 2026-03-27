import type { ScanPassResult, OrchestratorState, OrchestratorIssue } from '../commands/orchestrate.js';
import type { OrchestratorAdapter } from './adapter.js';

export interface BlockerRecord {
  hash: string;
  type: string;
  affectedIssue: number | null;
  errorSnippet: string;
  firstSeenIteration: number;
  lastSeenIteration: number;
  count: number;
}

export interface SelfHealingDeps {
  readFile: (path: string, enc: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, enc: BufferEncoding) => Promise<void>;
  existsSync: (path: string) => boolean;
  now: () => Date;
  isProcessAlive?: (pid: number) => boolean;
}

const DEFAULT_THRESHOLD = 5;

function hashBlocker(type: string, affectedIssue: number | null, snippet: string): string {
  return `${type}:${String(affectedIssue)}:${snippet.slice(0, 64)}`;
}

export function trackBlockers(
  passResult: ScanPassResult,
  existingRecords: BlockerRecord[],
  currentIteration: number,
): BlockerRecord[] {
  const detected: Array<{ type: string; affectedIssue: number | null; errorSnippet: string }> = [];
  if (passResult.childMonitoring) {
    for (const entry of passResult.childMonitoring.entries) {
      if (entry.action === 'failed' || entry.action === 'exited_no_pr') {
        detected.push({
          type: entry.action === 'failed' ? 'child_failed' : 'child_exited_no_pr',
          affectedIssue: entry.issue_number,
          errorSnippet: entry.error ?? entry.action,
        });
      }
    }
  }
  if (!passResult.allDone && !passResult.budgetExceeded && !passResult.shouldStop &&
      passResult.dispatched === 0 && passResult.triage.triaged_entries === 0 && !passResult.waveAdvanced) {
    detected.push({ type: 'no_progress', affectedIssue: null, errorSnippet: 'No issues dispatched or triaged' });
  }
  const safe = Array.isArray(existingRecords) ? existingRecords : [];
  const updated = new Map<string, BlockerRecord>(safe.map((r) => [r.hash, { ...r }]));
  for (const d of detected) {
    const hash = hashBlocker(d.type, d.affectedIssue, d.errorSnippet);
    const existing = updated.get(hash);
    if (existing) {
      existing.lastSeenIteration = currentIteration;
      existing.count += 1;
    } else {
      updated.set(hash, {
        hash, type: d.type, affectedIssue: d.affectedIssue,
        errorSnippet: d.errorSnippet.slice(0, 64),
        firstSeenIteration: currentIteration, lastSeenIteration: currentIteration, count: 1,
      });
    }
  }
  return [...updated.values()];
}

export async function writeDiagnosticsJson(
  sessionDir: string,
  records: BlockerRecord[],
  threshold: number,
  now: () => Date,
  writeFile: (path: string, data: string, enc: BufferEncoding) => Promise<void>,
): Promise<void> {
  const over = records.filter((r) => r.count >= threshold);
  if (over.length === 0) return;
  const payload = over.map((r) => {
    const severity = r.count >= threshold * 2 ? 'critical' : 'warning';
    const suggestedFix = r.affectedIssue !== null
      ? `Investigate ${r.type} for issue #${r.affectedIssue}: ${r.errorSnippet}`
      : `Investigate ${r.type}: ${r.errorSnippet}`;
    return {
      type: r.type,
      message: r.errorSnippet,
      first_seen_iteration: r.firstSeenIteration,
      current_iteration: r.lastSeenIteration,
      severity,
      suggested_fix: suggestedFix,
    };
  });
  await writeFile(`${sessionDir}/diagnostics.json`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function writeAlertMd(
  sessionDir: string,
  records: BlockerRecord[],
  threshold: number,
  writeFile: (path: string, data: string, enc: BufferEncoding) => Promise<void>,
): Promise<void> {
  const alertRecords = records.filter((r) => r.count >= threshold);
  if (alertRecords.length === 0) return;
  const lines = ['# ALERT: Persistent Blockers Detected\n'];
  for (const r of alertRecords) {
    lines.push(`## ${r.type} (issue ${r.affectedIssue ?? 'n/a'})`);
    lines.push(`- Error: ${r.errorSnippet}`);
    lines.push(`- Seen ${r.count} times (iterations ${r.firstSeenIteration}–${r.lastSeenIteration})`);
    lines.push(`- **Action required:** Manual investigation needed\n`);
  }
  await writeFile(`${sessionDir}/ALERT.md`, lines.join('\n'), 'utf8');
}

async function cleanStaleSessions(aloopRoot: string, sessionDir: string, state: OrchestratorState, deps: SelfHealingDeps): Promise<void> {
  const activePath = `${aloopRoot}/active.json`;
  if (!deps.existsSync(activePath)) return;
  let active: Record<string, { pid?: number }>;
  try { active = JSON.parse(await deps.readFile(activePath, 'utf8')) as Record<string, { pid?: number }>; }
  catch { return; }
  const isAlive = deps.isProcessAlive ??
    ((pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } });
  const staleIds = Object.entries(active)
    .filter(([, e]) => typeof e.pid === 'number' && !isAlive(e.pid)).map(([id]) => id);
  if (staleIds.length === 0) return;
  for (const id of staleIds) delete active[id];
  await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
  const stateFile = `${sessionDir}/orchestrator.json`;
  let orchState: OrchestratorState;
  try { orchState = JSON.parse(await deps.readFile(stateFile, 'utf8')) as OrchestratorState; }
  catch { orchState = state; }
  let changed = false;
  for (const issue of orchState.issues as OrchestratorIssue[]) {
    if (issue.child_session !== null && staleIds.includes(issue.child_session)) {
      issue.state = 'failed';
      changed = true;
    }
  }
  if (changed) {
    orchState.updated_at = deps.now().toISOString();
    await deps.writeFile(stateFile, `${JSON.stringify(orchState, null, 2)}\n`, 'utf8');
  }
}

export async function runSelfHealingAndDiagnostics(
  passResult: ScanPassResult,
  sessionDir: string,
  blockerRecords: BlockerRecord[],
  state: OrchestratorState,
  adapter: OrchestratorAdapter | null,
  deps: SelfHealingDeps,
  aloopRoot?: string,
): Promise<BlockerRecord[]> {
  const updated = trackBlockers(passResult, blockerRecords, passResult.iteration);
  const threshold = state.diagnostics_blocker_threshold ?? DEFAULT_THRESHOLD;
  if (adapter) {
    for (const record of updated) {
      if (record.type === 'label_not_found' && record.count >= 1) {
        try { await adapter.ensureLabelExists(record.errorSnippet.slice(0, 64), { color: 'ededed' }); }
        catch { /* swallow — idempotent */ }
      }
    }
  }
  if (aloopRoot) await cleanStaleSessions(aloopRoot, sessionDir, state, deps);
  await writeDiagnosticsJson(sessionDir, updated, threshold, deps.now, deps.writeFile);
  await writeAlertMd(sessionDir, updated, threshold, deps.writeFile);
  const hasStuckBlocker = updated.some((r) => r.count >= threshold);
  if (hasStuckBlocker) {
    const stateFile = `${sessionDir}/orchestrator.json`;
    let orchState: OrchestratorState;
    try { orchState = JSON.parse(await deps.readFile(stateFile, 'utf8')) as OrchestratorState; }
    catch { orchState = state; }
    if (!orchState.stuck) {
      orchState.stuck = true;
      orchState.updated_at = deps.now().toISOString();
      await deps.writeFile(stateFile, `${JSON.stringify(orchState, null, 2)}\n`, 'utf8');
    }
  }
  return updated;
}
