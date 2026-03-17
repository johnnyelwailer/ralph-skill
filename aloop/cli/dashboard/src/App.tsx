import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { toast } from 'sonner';
import {
  Activity, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
  GitBranch, GitCommit, Image, FileText, Menu, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Play, Search, Send, Square, Terminal, Timer, XCircle, Zap, Loader2,
  Heart, AlertTriangle, Pause, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parseTodoProgress } from '../../src/lib/parseTodoProgress';

// ── ANSI + Markdown rendering ──
// Strip ANSI escape codes from text (for compact log entries)
const STRIP_ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
function stripAnsi(text: string): string {
  return text.replace(STRIP_ANSI_RE, '');
}
// Parses ANSI SGR escape codes into styled segments, runs each segment's
// text through marked (markdown→HTML), and wraps the result in <span>s
// with inline styles. Based on ansi_up's palette and SGR handling.

// 256-color palette — indices 0-15: standard, 16-231: 6x6x6 RGB, 232-255: grayscale
const PALETTE_256: [number, number, number][] = (() => {
  const p: [number, number, number][] = [];
  // Standard colors (0-7 normal, 8-15 bright)
  const std: [number, number, number][] = [
    [0, 0, 0], [187, 0, 0], [0, 187, 0], [187, 187, 0],
    [0, 0, 187], [187, 0, 187], [0, 187, 187], [187, 187, 187],
    [85, 85, 85], [255, 85, 85], [0, 255, 0], [255, 255, 85],
    [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
  ];
  for (const c of std) p.push(c);
  // 6x6x6 RGB cube (16-231)
  for (const r of [0, 95, 135, 175, 215, 255])
    for (const g of [0, 95, 135, 175, 215, 255])
      for (const b of [0, 95, 135, 175, 215, 255])
        p.push([r, g, b]);
  // Grayscale ramp (232-255)
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    p.push([v, v, v]);
  }
  return p;
})();

function rgbStr(r: number, g: number, b: number): string {
  return `${r},${g},${b}`;
}

interface AnsiStyle {
  fg?: string;      // "r,g,b"
  bg?: string;      // "r,g,b"
  bold?: boolean;
  faint?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function parseAnsiSegments(text: string): { text: string; style: AnsiStyle }[] {
  const segments: { text: string; style: AnsiStyle }[] = [];
  let style: AnsiStyle = {};
  let last = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), style: { ...style } });
    const cmds = m[1] ? m[1].split(';') : ['0'];
    let i = 0;
    while (i < cmds.length) {
      const num = parseInt(cmds[i], 10);
      if (isNaN(num) || num === 0) {
        style = {};
      } else if (num === 1) { style.bold = true; }
      else if (num === 2) { style.faint = true; }
      else if (num === 3) { style.italic = true; }
      else if (num === 4) { style.underline = true; }
      else if (num === 21) { style.bold = false; }
      else if (num === 22) { style.bold = false; style.faint = false; }
      else if (num === 23) { style.italic = false; }
      else if (num === 24) { style.underline = false; }
      else if (num === 39) { style.fg = undefined; }
      else if (num === 49) { style.bg = undefined; }
      else if (num >= 30 && num < 38) { style.fg = rgbStr(...PALETTE_256[num - 30]); }
      else if (num >= 40 && num < 48) { style.bg = rgbStr(...PALETTE_256[num - 40]); }
      else if (num >= 90 && num < 98) { style.fg = rgbStr(...PALETTE_256[num - 90 + 8]); }
      else if (num >= 100 && num < 108) { style.bg = rgbStr(...PALETTE_256[num - 100 + 8]); }
      else if (num === 38 || num === 48) {
        const isFg = num === 38;
        const mode = cmds[i + 1];
        if (mode === '5' && i + 2 < cmds.length) {
          // 256-color palette: 38;5;N or 48;5;N
          const idx = parseInt(cmds[i + 2], 10);
          if (idx >= 0 && idx <= 255) {
            const c = rgbStr(...PALETTE_256[idx]);
            if (isFg) style.fg = c; else style.bg = c;
          }
          i += 2;
        } else if (mode === '2' && i + 4 < cmds.length) {
          // True color: 38;2;R;G;B or 48;2;R;G;B
          const r = parseInt(cmds[i + 2], 10);
          const g = parseInt(cmds[i + 3], 10);
          const b = parseInt(cmds[i + 4], 10);
          if ([r, g, b].every(v => v >= 0 && v <= 255)) {
            const c = rgbStr(r, g, b);
            if (isFg) style.fg = c; else style.bg = c;
          }
          i += 4;
        }
      }
      i++;
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), style: { ...style } });
  return segments;
}

function renderAnsiToHtml(text: string, opts: { gfm?: boolean; breaks?: boolean } = {}): string {
  const segments = parseAnsiSegments(text);
  const { gfm = true, breaks = true } = opts;
  return segments.map(({ text: segText, style }) => {
    const html = marked.parse(segText, { gfm, breaks }) as string;
    if (!style.fg && !style.bg && !style.bold && !style.faint && !style.italic && !style.underline) {
      return html;
    }
    const styles: string[] = [];
    if (style.fg) styles.push(`color:rgb(${style.fg})`);
    if (style.bg) styles.push(`background-color:rgb(${style.bg})`);
    if (style.bold) styles.push('font-weight:bold');
    if (style.faint) styles.push('opacity:0.7');
    if (style.italic) styles.push('font-style:italic');
    if (style.underline) styles.push('text-decoration:underline');
    return `<span class="ansi" style="${styles.join(';')}">${html}</span>`;
  }).join('');
}

// ── Types ──

type SessionStatus = Record<string, unknown>;

interface ArtifactManifest { iteration: number; manifest: unknown; outputHeader?: string }

interface DashboardState {
  sessionDir: string;
  workdir: string;
  runtimeDir: string;
  updatedAt: string;
  status: SessionStatus | null;
  log: string;
  docs: Record<string, string>;
  activeSessions: unknown[];
  recentSessions: unknown[];
  artifacts: ArtifactManifest[];
  repoUrl: string | null;
}

interface SessionSummary {
  id: string;
  name: string;
  projectName: string;
  status: string;
  phase: string;
  elapsed: string;
  iterations: string;
  isActive: boolean;
  branch: string;
  startedAt: string;
  endedAt: string;
  pid: string;
  provider: string;
  workDir: string;
  stuckCount: number;
}

interface LogEntry {
  timestamp: string;
  phase: string;
  event: string;
  provider: string;
  model: string;
  duration: string;
  message: string;
  raw: string;
  rawObj: Record<string, unknown> | null;
  iteration: number | null;
  dateKey: string;
  isSuccess: boolean;
  isError: boolean;
  commitHash: string;
  resultDetail: string;
  filesChanged: FileChange[];
  isSignificant: boolean;
}

interface FileChange {
  path: string;
  type: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
}

interface ArtifactEntry {
  type: string;
  path: string;
  description: string;
  metadata?: { baseline?: string; diff_percentage?: number };
}

interface ManifestPayload {
  iteration: number;
  phase: string;
  summary: string;
  artifacts: ArtifactEntry[];
  outputHeader?: string;
}

interface ProviderHealth {
  name: string;
  status: 'healthy' | 'cooldown' | 'failed';
  lastEvent: string;
  reason?: string;
  consecutiveFailures?: number;
  cooldownUntil?: string;
}

// ── Helpers ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(source: Record<string, unknown>, keys: string[], fb = ''): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return fb;
}

function numStr(source: Record<string, unknown>, keys: string[], fb = '--'): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fb;
}

function toSession(source: Record<string, unknown>, fallback: string, isActive: boolean): SessionSummary {
  return {
    id: str(source, ['session_id', 'id'], fallback),
    name: str(source, ['session_id', 'name', 'session_name'], fallback),
    projectName: str(source, ['project_name'], fallback.split('-').slice(0, -1).join('-') || fallback),
    status: str(source, ['state', 'status'], 'unknown'),
    phase: str(source, ['phase', 'mode'], ''),
    elapsed: str(source, ['elapsed', 'elapsed_time', 'duration'], '--'),
    iterations: numStr(source, ['iteration', 'iterations']),
    isActive,
    branch: str(source, ['branch'], ''),
    startedAt: str(source, ['started_at'], ''),
    endedAt: str(source, ['ended_at'], ''),
    pid: numStr(source, ['pid'], ''),
    provider: str(source, ['provider'], ''),
    workDir: str(source, ['work_dir'], ''),
    stuckCount: typeof source.stuck_count === 'number' ? source.stuck_count : 0,
  };
}

function formatTime(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ts; }
}

function formatTimeShort(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ts; }
}

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDuration(raw: string): string {
  const match = raw.match(/^(\d+)s$/);
  if (!match) return raw;
  return formatSecs(parseInt(match[1], 10));
}

function formatDateKey(ts: string): string {
  if (!ts) return 'Unknown';
  try { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'Unknown'; }
}

function relativeTime(ts: string): string {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ''; }
}

const SIGNIFICANT_EVENTS = new Set([
  'iteration_complete', 'iteration_error', 'provider_cooldown', 'provider_recovered',
  'review_verdict_read', 'review_verdict_missing', 'session_start', 'session_end', 'session_restart',
  'queue_override_applied', 'queue_override_error',
]);

function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let rawObj: Record<string, unknown> | null = null;
  try {
    const obj = JSON.parse(trimmed);
    if (isRecord(obj)) rawObj = obj;
  } catch { /* plain text */ }

  if (rawObj) {
    const event = str(rawObj, ['event', 'type', 'action'], '');
    const isSignificant = SIGNIFICANT_EVENTS.has(event);
    const ts = str(rawObj, ['timestamp', 'ts', 'time', 'created_at']);
    const phase = str(rawObj, ['phase', 'mode']);
    const provider = str(rawObj, ['provider']);
    const model = str(rawObj, ['model']);
    const duration = str(rawObj, ['duration', 'elapsed', 'took']);
    const message = str(rawObj, ['message', 'msg', 'detail', 'description', 'text'], event);
    const iterRaw = rawObj.iteration;
    const iteration = typeof iterRaw === 'number' ? iterRaw : (typeof iterRaw === 'string' ? parseInt(iterRaw, 10) || null : null);
    const commitHash = str(rawObj, ['commit', 'commit_hash', 'sha']);
    const isSuccess = event.includes('complete') || event.includes('success') || event.includes('approved') || event.includes('recovered');
    const isError = event.includes('error') || event.includes('fail') || event.includes('cooldown');

    let resultDetail = '';
    if (commitHash) resultDetail = commitHash.slice(0, 7);
    else if (event.includes('verdict')) resultDetail = str(rawObj, ['verdict']);
    else if (isError) resultDetail = str(rawObj, ['reason', 'error', 'exit_code'], 'error');

    const filesChanged: FileChange[] = [];
    const files = rawObj.files ?? rawObj.files_changed;
    if (Array.isArray(files)) {
      for (const f of files) {
        if (isRecord(f)) {
          filesChanged.push({
            path: typeof f.path === 'string' ? f.path : typeof f.file === 'string' ? f.file : '?',
            type: (typeof f.status === 'string' ? f.status[0]?.toUpperCase() : 'M') as FileChange['type'],
            additions: typeof f.additions === 'number' ? f.additions : 0,
            deletions: typeof f.deletions === 'number' ? f.deletions : 0,
          });
        }
      }
    }

    return { timestamp: ts, phase, event, provider, model, duration, message: stripAnsi(message), raw: trimmed, rawObj, iteration, dateKey: formatDateKey(ts), isSuccess, isError, commitHash, resultDetail, filesChanged, isSignificant };
  }

  // Plain text lines (provider stderr, stack traces) are not significant — hide from activity view
  return { timestamp: '', phase: '', event: '', provider: '', model: '', duration: '', message: stripAnsi(trimmed), raw: trimmed, rawObj: null, iteration: null, dateKey: 'Log', isSuccess: false, isError: false, commitHash: '', resultDetail: '', filesChanged: [], isSignificant: false };
}

// ── Phase colors ──

const phaseColors: Record<string, string> = {
  plan: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  build: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  proof: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
};

const phaseBarColors: Record<string, string> = {
  plan: 'bg-purple-500', build: 'bg-yellow-500', proof: 'bg-amber-500', review: 'bg-cyan-500',
};

const phaseDotColors: Record<string, string> = {
  plan: 'text-purple-500', build: 'text-yellow-500', proof: 'text-amber-500', review: 'text-cyan-500',
};

const statusColors: Record<string, string> = {
  running: 'text-green-600 dark:text-green-400',
  exited: 'text-muted-foreground',
  stopped: 'text-red-600 dark:text-red-400',
  stopping: 'text-orange-600 dark:text-orange-400',
};

function PhaseBadge({ phase, small }: { phase: string; small?: boolean }) {
  if (!phase) return null;
  const colors = phaseColors[phase.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  const size = small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs';
  return <span className={`inline-block rounded border font-medium ${colors} ${size}`}>{phase}</span>;
}

const STATUS_DOT_CONFIG: Record<string, { color: string; label: string }> = {
  running: { color: 'bg-green-500', label: 'Running' },
  stopped: { color: 'bg-muted-foreground/50', label: 'Stopped' },
  exited: { color: 'bg-muted-foreground/50', label: 'Exited' },
  unhealthy: { color: 'bg-red-500', label: 'Unhealthy' },
  error: { color: 'bg-red-500', label: 'Error' },
  stuck: { color: 'bg-orange-500', label: 'Stuck' },
  unknown: { color: 'bg-muted-foreground/30', label: 'Unknown' },
};

function StatusDot({ status, className = '' }: { status: string; className?: string }) {
  const config = STATUS_DOT_CONFIG[status] ?? STATUS_DOT_CONFIG.unknown;
  const label = config.label;

  const dot = status === 'running' ? (
    <span className={`relative flex h-2.5 w-2.5 shrink-0 ${className}`}>
      <span className={`absolute inline-flex h-full w-full animate-pulse-dot rounded-full ${config.color}/70`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.color}`} />
    </span>
  ) : (
    <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${config.color} ${className}`} />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{dot}</span></TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  );
}

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const Icon = status === 'connected' ? Zap : status === 'connecting' ? Loader2 : AlertTriangle;
  const color = status === 'connected' ? 'text-green-500' : status === 'connecting' ? 'text-yellow-500 animate-spin' : 'text-red-500';
  const label = status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting...' : 'Disconnected';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <Icon className={`h-3 w-3 ${color}`} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent><p>SSE connection: {label}</p></TooltipContent>
    </Tooltip>
  );
}

// ── Elapsed timer ──

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const start = new Date(since).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(formatSecs(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <>{elapsed}</>;
}

// ── Artifact helpers ──

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
function isImageArtifact(a: ArtifactEntry) {
  const ext = a.path.includes('.') ? a.path.slice(a.path.lastIndexOf('.')).toLowerCase() : '';
  return IMAGE_EXT.has(ext) || a.type === 'screenshot' || a.type === 'visual_diff';
}
function artifactUrl(iter: number, file: string) { return `/api/artifacts/${iter}/${encodeURIComponent(file)}`; }

function parseManifest(am: ArtifactManifest): ManifestPayload | null {
  const m = am.manifest;
  if (!isRecord(m) && !am.outputHeader) return null;
  const manifest = isRecord(m) ? m : null;
  return {
    iteration: am.iteration,
    phase: manifest && typeof manifest.phase === 'string' ? manifest.phase : 'proof',
    summary: manifest && typeof manifest.summary === 'string' ? manifest.summary : '',
    artifacts: manifest && Array.isArray(manifest.artifacts) ? (manifest.artifacts as unknown[]).filter(isRecord).map((a) => ({
      type: typeof a.type === 'string' ? a.type : 'unknown',
      path: typeof a.path === 'string' ? a.path : '',
      description: typeof a.description === 'string' ? a.description : '',
      metadata: isRecord(a.metadata) ? {
        baseline: typeof a.metadata.baseline === 'string' ? a.metadata.baseline : undefined,
        diff_percentage: typeof a.metadata.diff_percentage === 'number' ? a.metadata.diff_percentage : undefined,
      } : undefined,
    })) : [],
    outputHeader: am.outputHeader,
  };
}

/** Extract model from opencode output header like "> build · openrouter/hunter-alpha" */
function extractModelFromOutput(header?: string): string {
  if (!header) return '';
  const match = header.match(/^>\s*\w+\s*·\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

// ── Average iteration duration from log ──

function parseDurationSeconds(raw: string): number | null {
  if (!raw) return null;
  const msMatch = raw.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) return parseFloat(msMatch[1]) / 1000;
  const sMatch = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (sMatch) return parseFloat(sMatch[1]);
  const mixedMatch = raw.match(/^(\d+)m\s*(\d+(?:\.\d+)?)s$/);
  if (mixedMatch) return parseInt(mixedMatch[1], 10) * 60 + parseFloat(mixedMatch[2]);
  const plainMatch = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (plainMatch) return parseFloat(plainMatch[1]);
  return null;
}

function computeAvgDuration(log: string): string {
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

// ── Provider health derived from log ──

function deriveProviderHealth(log: string): ProviderHealth[] {
  const providers = new Map<string, ProviderHealth>();
  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (!isRecord(obj)) continue;
      const event = str(obj, ['event']);
      const provider = str(obj, ['provider']);
      const ts = str(obj, ['timestamp']);
      if (!provider) continue;

      if (event === 'provider_cooldown') {
        providers.set(provider, {
          name: provider,
          status: 'cooldown',
          lastEvent: ts,
          reason: str(obj, ['reason']),
          consecutiveFailures: typeof obj.consecutive_failures === 'number' ? obj.consecutive_failures : undefined,
          cooldownUntil: str(obj, ['cooldown_until']),
        });
      } else if (event === 'provider_recovered') {
        providers.set(provider, { name: provider, status: 'healthy', lastEvent: ts });
      } else if (event === 'iteration_complete' || event === 'iteration_error') {
        if (!providers.has(provider)) {
          providers.set(provider, { name: provider, status: 'healthy', lastEvent: ts });
        } else {
          const existing = providers.get(provider)!;
          if (event === 'iteration_complete' && existing.status !== 'cooldown') {
            existing.status = 'healthy';
          }
          existing.lastEvent = ts;
        }
      }
    } catch { /* skip */ }
  }
  return Array.from(providers.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Sidebar ──

function Sidebar({
  sessions, selectedSessionId, onSelectSession, collapsed, onToggle,
}: {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  // Group by project
  const { projectGroups, olderSessions } = useMemo(() => {
    const now = Date.now();
    const cutoff = 24 * 60 * 60 * 1000; // 24h
    const active: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const s of sessions) {
      const lastActivity = s.endedAt || s.startedAt;
      const age = lastActivity ? now - new Date(lastActivity).getTime() : Infinity;
      if (s.isActive || s.status === 'running' || age < cutoff) {
        active.push(s);
      } else {
        older.push(s);
      }
    }

    const groups = new Map<string, SessionSummary[]>();
    for (const s of active) {
      const key = s.projectName || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return { projectGroups: groups, olderSessions: older };
  }, [sessions]);

  const [olderOpen, setOlderOpen] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex flex-col items-center border-r border-border bg-sidebar py-2 px-1 w-10 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggle}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Expand sidebar (Ctrl+B)</p></TooltipContent>
        </Tooltip>
        <div className="mt-3 space-y-2">
          {sessions.slice(0, 8).map((s) => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <button type="button" className="block" onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}>
                  <StatusDot status={s.isActive && s.status === 'running' ? 'running' : s.status} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right"><p>{s.name} ({s.status})</p></TooltipContent>
            </Tooltip>
          ))}
        </div>
      </aside>
    );
  }

  const isSelected = (s: SessionSummary) =>
    selectedSessionId === null ? sessions.indexOf(s) === 0 : s.id === selectedSessionId;

  const renderCard = (s: SessionSummary) => (
    <Tooltip key={s.id}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`w-full overflow-hidden rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${isSelected(s) ? 'bg-accent' : ''}`}
          onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <StatusDot status={s.isActive && s.status === 'running' ? 'running' : s.status} />
            <span className="truncate font-medium flex-1">{s.name}</span>
            <span className="text-muted-foreground/50 text-[10px] shrink-0">{relativeTime(s.endedAt || s.startedAt)}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 ml-4 text-[10px] text-muted-foreground/60 overflow-hidden">
            {s.branch && <GitBranch className="h-2.5 w-2.5 shrink-0" />}
            {s.branch && <span className="truncate">{s.branch}</span>}
            {s.phase && <span className="shrink-0">·</span>}
            {s.phase && <PhaseBadge phase={s.phase} small />}
            {s.iterations && s.iterations !== '--' && <span className="shrink-0">iter {s.iterations}</span>}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-lg">
        <div className="space-y-0.5 text-xs">
          <p className="font-medium">{s.id}</p>
          {s.pid && <p>PID: {s.pid}</p>}
          <p>Status: {s.status}</p>
          {s.stuckCount > 0 && <p className="text-red-500">Stuck: {s.stuckCount}</p>}
          <p>Provider: {s.provider}</p>
          {s.startedAt && <p>Started: {new Date(s.startedAt).toLocaleString()}</p>}
          {s.endedAt && <p>Ended: {new Date(s.endedAt).toLocaleString()}</p>}
          {s.workDir && <p className="break-all">Dir: {s.workDir}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <aside className="flex flex-col border-r border-border bg-sidebar w-64 shrink-0 animate-slide-in-left">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggle}>
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Collapse (Ctrl+B)</p></TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 overflow-hidden">
          {Array.from(projectGroups.entries()).map(([project, items]) => (
            <Collapsible key={project} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground">
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                {project}
                <span className="ml-auto text-muted-foreground/40">{items.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5 mb-2">{items.map(renderCard)}</div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {olderSessions.length > 0 && (
            <Collapsible open={olderOpen} onOpenChange={setOlderOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider hover:text-muted-foreground">
                {olderOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Older
                <span className="ml-auto">{olderSessions.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5 mb-2">{olderSessions.map(renderCard)}</div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {sessions.length === 0 && <p className="text-xs text-muted-foreground p-2">No sessions.</p>}
        </div>
      </ScrollArea>
    </aside>
  );
}

// ── Header ──

function Header({
  sessionName, isRunning, currentState, currentPhase, currentIteration,
  providerName, modelName, tasksCompleted, tasksTotal, progressPercent,
  updatedAt, loading, loadError, connectionStatus, onOpenCommand, onOpenSwitcher,
  stuckCount, startedAt, avgDuration, maxIterations, onToggleMobileMenu,
}: {
  sessionName: string; isRunning: boolean; currentState: string; currentPhase: string;
  currentIteration: string; providerName: string; modelName: string;
  tasksCompleted: number; tasksTotal: number; progressPercent: number;
  updatedAt: string; loading: boolean; loadError: string | null;
  connectionStatus: ConnectionStatus; onOpenCommand: () => void; onOpenSwitcher: () => void;
  stuckCount: number; startedAt: string; avgDuration: string; maxIterations: number | null;
  onToggleMobileMenu: () => void;
}) {
  const phaseBarColor = phaseBarColors[currentPhase.toLowerCase()] ?? 'bg-muted-foreground';
  return (
    <header className="border-b border-border px-3 py-2 md:px-4 md:py-2.5 shrink-0">
      <h1 className="sr-only">Aloop Dashboard</h1>
      <div className="flex items-center gap-2 sm:gap-4" data-testid="session-header-grid">
        <button type="button" className="md:hidden p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggleMobileMenu}>
          <Menu className="h-5 w-5" />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="flex items-center gap-2 min-w-0 hover:text-primary transition-colors" onClick={onOpenSwitcher}>
              <StatusDot status={isRunning ? 'running' : currentState} />
              <span className="text-sm font-semibold truncate max-w-[120px] sm:max-w-[180px] md:max-w-[200px]">{sessionName}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent><p>{sessionName}</p></TooltipContent>
        </Tooltip>

        {/* Iteration info — hidden on mobile, tap session name for details */}
        <HoverCard>
          <HoverCardTrigger asChild>
            <span className="text-xs text-muted-foreground cursor-help whitespace-nowrap hidden sm:flex items-center gap-1">
              <Activity className="h-3 w-3" />
              iter {currentIteration}{maxIterations ? `/${maxIterations}` : '/\u221E'}{tasksTotal > 0 ? ` \u00B7 ${tasksTotal} todos` : ''}
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-56 text-xs">
            <div className="space-y-1">
              <p><span className="text-muted-foreground">Phase:</span> {currentPhase || 'none'}</p>
              <p><span className="text-muted-foreground">Status:</span> {currentState}</p>
              <p><span className="text-muted-foreground">Provider:</span> {providerName || 'none'}</p>
              <p><span className="text-muted-foreground">TODOs:</span> {tasksCompleted}/{tasksTotal} ({progressPercent}%)</p>
              <p><span className="text-muted-foreground">Stuck:</span> <span className={stuckCount > 0 ? 'text-red-500 font-medium' : ''}>{stuckCount}</span></p>
              {startedAt && <p><span className="text-muted-foreground">Elapsed:</span> <ElapsedTimer since={startedAt} /></p>}
              {avgDuration && <p><span className="text-muted-foreground">Avg iter:</span> {avgDuration}</p>}
            </div>
          </HoverCardContent>
        </HoverCard>

        {startedAt && (
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <ElapsedTimer since={startedAt} />
          </span>
        )}
        {avgDuration && (
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap hidden lg:inline">~{avgDuration}/iter</span>
        )}

        {/* Progress bar — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 max-w-xs" data-testid="header-progress">
          <Progress value={progressPercent} className="flex-1 h-1.5" indicatorClassName={phaseBarColor} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
        </div>

        <PhaseBadge phase={currentPhase} />
        {providerName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground whitespace-nowrap truncate max-w-[160px] hidden lg:inline" data-testid="header-provider-model">{modelName ? `${providerName}/${modelName}` : providerName}</span>
            </TooltipTrigger>
            <TooltipContent><p>{modelName ? `${providerName}/${modelName}` : providerName}</p></TooltipContent>
          </Tooltip>
        )}
        {/* Status label — hidden on mobile (StatusDot already shows it) */}
        <span className={`text-xs whitespace-nowrap font-medium hidden sm:inline ${statusColors[currentState] ?? 'text-muted-foreground'}`} data-testid="header-status">{currentState}</span>

        <div className="flex-1" />
        <ConnectionIndicator status={connectionStatus} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block" onClick={onOpenCommand}>
              <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-mono flex items-center gap-1"><Search className="h-3 w-3" /> <span className="hidden lg:inline">K</span></kbd>
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Command palette (Ctrl+K)</p></TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:inline" data-testid="header-updated-at">
          {loading ? 'Loading...' : updatedAt ? formatTime(updatedAt) : ''}{loadError && !loading ? ' \u2022 err' : ''}
        </span>
      </div>
    </header>
  );
}

// ── Docs Panel ──

function DocsPanel({ docs, providerHealth, activityCollapsed, repoUrl }: { docs: Record<string, string>; providerHealth: ProviderHealth[]; activityCollapsed?: boolean; repoUrl?: string | null }) {
  const docOrder = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
  const tabLabels: Record<string, string> = { 'TODO.md': 'TODO', 'SPEC.md': 'SPEC', 'RESEARCH.md': 'RESEARCH', 'REVIEW_LOG.md': 'REVIEW LOG', 'STEERING.md': 'STEERING' };

  const availableDocs = docOrder.filter((n) => docs[n] != null && docs[n] !== '');
  const extraDocs = Object.keys(docs).filter((n) => !docOrder.includes(n) && docs[n] != null && docs[n] !== '');
  const allDocs = [...availableDocs, ...extraDocs];

  const MAX_VISIBLE_TABS = 4;
  const visibleTabs = allDocs.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = allDocs.slice(MAX_VISIBLE_TABS);

  // Always add Health as a special tab
  const defaultTab = allDocs.includes('TODO.md') ? 'TODO.md' : allDocs[0] ?? '_health';

  return (
    <Tabs defaultValue={defaultTab} className="flex flex-col h-full">
      <div className="flex items-center shrink-0">
        <TabsList className="h-8 bg-muted/50 flex-nowrap sm:flex-wrap justify-start flex-1 overflow-x-auto whitespace-nowrap">
          {visibleTabs.map((n) => (
            <TabsTrigger key={n} value={n} className="text-[10px] sm:text-[11px] px-2 py-1 h-6 data-[state=active]:bg-background">
              {tabLabels[n] ?? n.replace(/\.md$/i, '')}
            </TabsTrigger>
          ))}
          <TabsTrigger value="_health" className="text-[10px] sm:text-[11px] px-2 py-1 h-6 data-[state=active]:bg-background">
            <Heart className="h-3 w-3 mr-1" /> Health
          </TabsTrigger>
          {overflowTabs.length > 0 && (
            <div className="relative group">
              <button type="button" className="px-2 py-1 h-6 text-[11px] text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              <div className="absolute right-0 top-full z-20 hidden group-hover:block bg-popover border rounded-md shadow-md py-1 min-w-[120px]">
                {overflowTabs.map((n) => (
                  <TabsTrigger key={n} value={n} className="w-full text-left text-[11px] px-3 py-1.5 hover:bg-accent data-[state=active]:bg-accent">
                    {tabLabels[n] ?? n.replace(/\.md$/i, '')}
                  </TabsTrigger>
                ))}
              </div>
            </div>
          )}
          {repoUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors ml-auto">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </TooltipTrigger>
              <TooltipContent><p>Open repo on GitHub</p></TooltipContent>
            </Tooltip>
          )}
        </TabsList>
      </div>
      {allDocs.map((n) => (
        <TabsContent key={n} value={n} className="flex-1 min-h-0 mt-0">
          <DocContent content={docs[n] ?? ''} name={n} wide={activityCollapsed} />
        </TabsContent>
      ))}
      <TabsContent value="_health" className="flex-1 min-h-0 mt-0">
        <HealthPanel providers={providerHealth} />
      </TabsContent>
    </Tabs>
  );
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function DocContent({ content, name, wide }: { content: string; name: string; wide?: boolean }) {
  const isSpec = /spec/i.test(name);
  const { rendered, toc } = useMemo(() => {
    if (!content) return { rendered: '', toc: [] as Array<{ level: number; text: string; id: string }> };
    const headings: Array<{ level: number; text: string; id: string }> = [];
    const renderer = new marked.Renderer();
    renderer.heading = ({ tokens, depth }: { tokens: { raw: string }[]; depth: number }) => {
      const text = tokens.map((t) => t.raw).join('');
      const id = slugify(text);
      headings.push({ level: depth, text, id });
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    };
    const html = marked.parse(content, { gfm: true, breaks: true, renderer }) as string;
    return { rendered: html, toc: headings };
  }, [content]);
  if (!content) return <p className="text-xs text-muted-foreground p-3">No content for {name}.</p>;
  const minLevel = toc.length > 0 ? Math.min(...toc.map((h) => h.level)) : 1;
  const hasToc = isSpec && toc.length > 0;
  const tocNav = hasToc ? (
    <nav className="space-y-0.5 text-[11px]">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Table of Contents</span>
      {toc.map((h) => (
        <a key={h.id} href={`#${h.id}`} className="block text-muted-foreground hover:text-foreground transition-colors truncate" style={{ paddingLeft: `${(h.level - minLevel) * 12}px` }}>
          {h.text}
        </a>
      ))}
    </nav>
  ) : null;

  // Wide mode: TOC as sticky sidebar, doc as main content
  if (wide && hasToc) {
    return (
      <div className="grid h-full" style={{ gridTemplateColumns: 'minmax(160px, 220px) 1fr' }}>
        <div className="border-r border-border overflow-y-auto p-3 pr-2">
          {tocNav}
        </div>
        <ScrollArea className="h-full">
          <div className="prose-dashboard p-3 pr-4" dangerouslySetInnerHTML={{ __html: rendered }} />
        </ScrollArea>
      </div>
    );
  }

  // Normal mode: collapsible TOC above doc
  return (
    <ScrollArea className="h-full">
      {hasToc && (
        <div className="p-3 pb-0">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-medium uppercase tracking-wider">
              <ChevronRight className="h-3 w-3 collapsible-chevron" /> Table of Contents
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 mb-2 border-l-2 border-border pl-2">
                {tocNav}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      <div className="prose-dashboard p-3 pr-4" dangerouslySetInnerHTML={{ __html: rendered }} />
    </ScrollArea>
  );
}

function HealthPanel({ providers }: { providers: ProviderHealth[] }) {
  if (providers.length === 0) {
    return <p className="text-xs text-muted-foreground p-3">No provider data yet.</p>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {providers.map((p) => (
          <Tooltip key={p.name}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-accent/30 cursor-default">
                {p.status === 'healthy' && <Circle className="h-3 w-3 text-green-500 fill-green-500" />}
                {p.status === 'cooldown' && <Pause className="h-3 w-3 text-orange-500" />}
                {p.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground ml-auto">
                  {p.status === 'cooldown' && p.cooldownUntil ? (() => {
                    const remaining = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000));
                    if (remaining <= 0) return 'cooldown ending…';
                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    return `cooldown for ${h > 0 ? `${h}h ` : ''}${m}min`;
                  })() : p.status}
                </span>
                <span className="text-muted-foreground/50 text-[10px]">{relativeTime(p.lastEvent)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-0.5">
                <p>Provider: {p.name}</p>
                <p>Status: {p.status}</p>
                {p.reason && <p>Reason: {p.reason}</p>}
                {p.consecutiveFailures && <p>Failures: {p.consecutiveFailures}</p>}
                {p.cooldownUntil && <p>Cooldown until: {new Date(p.cooldownUntil).toLocaleTimeString()} ({(() => { const r = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000)); const h = Math.floor(r / 3600); const m = Math.floor((r % 3600) / 60); return r <= 0 ? 'ending' : `${h > 0 ? `${h}h ` : ''}${m}min left`; })()})</p>}
                {p.lastEvent && <p>Last event: {new Date(p.lastEvent).toLocaleString()}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </ScrollArea>
  );
}

// ── Activity Panel ──

function ActivityPanel({ log, artifacts, currentIteration, currentPhase, currentProvider, isRunning, iterationStartedAt }: { log: string; artifacts: ArtifactManifest[]; currentIteration: number | null; currentPhase: string; currentProvider: string; isRunning: boolean; iterationStartedAt?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    if (!log) return [];
    const all = log.split('\n').map(parseLogLine).filter((e): e is LogEntry => e !== null);
    // Filter to significant events only
    return all.filter((e) => e.isSignificant);
  }, [log]);

  // Deduplicate session_start — keep only first
  const deduped = useMemo(() => {
    let seenStart = false;
    return entries.filter((e) => {
      if (e.event === 'session_start') {
        if (seenStart) return false;
        seenStart = true;
      }
      return true;
    });
  }, [entries]);

  // Add synthetic "in progress" entry for currently running iteration
  const withCurrent = useMemo(() => {
    if (!isRunning || currentIteration === null) return deduped;
    // Check if the current iteration already has a complete/error entry from THIS run
    // (iteration numbers reset on resume, so old runs may have the same iteration number)
    const hasResult = deduped.some((e) => e.iteration === currentIteration && (e.isSuccess || e.isError) && (!iterationStartedAt || e.timestamp >= iterationStartedAt));
    if (hasResult) return deduped;
    // Add a synthetic running entry — use real iteration start time, fall back to last log entry time
    const lastEntryTime = deduped.length > 0 ? deduped[deduped.length - 1].timestamp : '';
    const ts = iterationStartedAt || lastEntryTime || new Date().toISOString();
    const syntheticEntry: LogEntry = {
      timestamp: ts, phase: currentPhase, event: 'iteration_running', provider: currentProvider, model: '',
      duration: '', message: 'Running...', raw: '', rawObj: null, iteration: currentIteration,
      dateKey: formatDateKey(ts), isSuccess: false, isError: false, commitHash: '', resultDetail: '',
      filesChanged: [], isSignificant: true,
    };
    return [...deduped, syntheticEntry];
  }, [deduped, isRunning, currentIteration, currentPhase, currentProvider, iterationStartedAt]);

  // Group by date, newest first
  const grouped = useMemo(() => {
    const groups: Array<{ dateKey: string; entries: LogEntry[] }> = [];
    let current: { dateKey: string; entries: LogEntry[] } | null = null;
    for (const entry of withCurrent) {
      if (!current || current.dateKey !== entry.dateKey) {
        current = { dateKey: entry.dateKey, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    }
    for (const g of groups) g.entries.reverse();
    groups.reverse();
    return groups;
  }, [withCurrent]);

  const manifests = useMemo(() => artifacts.map(parseManifest).filter((m): m is ManifestPayload => m !== null), [artifacts]);
  const iterArtifacts = useMemo(() => {
    const map = new Map<number, ManifestPayload>();
    for (const m of manifests) map.set(m.iteration, m);
    return map;
  }, [manifests]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-1 pb-1.5 shrink-0">
        <span className="text-[10px] text-muted-foreground">{deduped.length} events</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" ref={containerRef}>
        <div ref={topRef} />
        {grouped.map((group) => (
          <div key={group.dateKey} className="mb-2">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm pb-1 mb-0.5">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" /> {group.dateKey}
              </span>
            </div>
            <div>
              {group.entries.map((entry) => (
                <LogEntryRow
                  key={`${entry.timestamp}-${entry.event}-${entry.iteration ?? 'x'}`}
                  entry={entry}
                  artifacts={entry.iteration !== null ? iterArtifacts.get(entry.iteration) ?? null : null}
                  isCurrentIteration={entry.iteration !== null && entry.iteration === currentIteration}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogEntryRow({ entry, artifacts, isCurrentIteration }: { entry: LogEntry; artifacts: ManifestPayload | null; isCurrentIteration: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [outputText, setOutputText] = useState<string | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const phaseColor = phaseDotColors[entry.phase?.toLowerCase()] ?? 'text-muted-foreground';
  const isRunningEntry = entry.event === 'iteration_running';
  const hasOutput = entry.iteration !== null && (entry.event.includes('complete') || entry.event.includes('error'));
  const hasExpandable = !isRunningEntry && (entry.filesChanged.length > 0 || (artifacts && artifacts.artifacts.length > 0) || hasOutput || entry.rawObj);

  const loadOutput = useCallback(async () => {
    if (outputText !== null || outputLoading || entry.iteration === null) return;
    setOutputLoading(true);
    try {
      const res = await fetch(`/api/artifacts/${entry.iteration}/output.txt`);
      if (res.ok) {
        setOutputText(await res.text());
      } else {
        setOutputText('');
      }
    } catch {
      setOutputText('');
    } finally {
      setOutputLoading(false);
    }
  }, [entry.iteration, outputText, outputLoading]);

  // Auto-load output when expanded
  useEffect(() => {
    if (expanded && hasOutput) loadOutput();
  }, [expanded, hasOutput, loadOutput]);

  // Scroll output to bottom when it loads (summary is usually at the end)
  useEffect(() => {
    if (outputText && outputRef.current) {
      requestAnimationFrame(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      });
    }
  }, [outputText]);

  return (
    <>
      <div
        className={`flex items-center gap-1.5 py-1 px-1.5 text-[11px] font-mono rounded transition-colors min-w-0 ${
          hasExpandable ? 'cursor-pointer hover:bg-accent/30' : 'hover:bg-accent/20'
        } ${expanded ? 'bg-accent/20' : ''}`}
        onClick={() => hasExpandable && setExpanded(!expanded)}
      >
        {/* Timestamp */}
        <span className="text-muted-foreground/60 shrink-0 w-11 text-right">{entry.timestamp ? formatTimeShort(entry.timestamp) : ''}</span>

        {/* Phase dot — centered with items-center on parent */}
        {isRunningEntry ? (
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`absolute inline-flex h-full w-full animate-pulse-dot rounded-full ${phaseColor === 'text-muted-foreground' ? 'bg-green-400' : ''}`} style={phaseColor !== 'text-muted-foreground' ? { backgroundColor: 'currentColor' } : undefined} />
            <Circle className={`relative h-2.5 w-2.5 fill-current ${phaseColor}`} />
          </span>
        ) : (
          <Circle className={`h-2.5 w-2.5 shrink-0 fill-current ${phaseColor}`} />
        )}

        {/* Phase label */}
        {entry.phase && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground shrink-0 w-12 truncate">{entry.phase}</span>
            </TooltipTrigger>
            <TooltipContent><p>{entry.phase}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Provider·model */}
        {entry.provider && (() => {
          const model = entry.model && entry.model !== 'opencode-default'
            ? entry.model
            : extractModelFromOutput(artifacts?.outputHeader);
          const label = model ? `${entry.provider}\u00b7${model}` : entry.provider;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground/70 shrink-0 max-w-[140px] truncate">{label}</span>
              </TooltipTrigger>
              <TooltipContent><p>{label}</p></TooltipContent>
            </Tooltip>
          );
        })()}

        {/* Result icon */}
        {entry.isSuccess && (
          <Tooltip>
            <TooltipTrigger asChild><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" /></TooltipTrigger>
            <TooltipContent><p>Success</p></TooltipContent>
          </Tooltip>
        )}
        {entry.isError && (
          <Tooltip>
            <TooltipTrigger asChild><XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" /></TooltipTrigger>
            <TooltipContent><p>{entry.resultDetail || 'Error'}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Result detail */}
        {entry.resultDetail && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`min-w-0 truncate ${entry.commitHash ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-muted-foreground/70'}`}>
                {entry.resultDetail}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-lg"><p className="break-all">{entry.resultDetail}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Message for non-iteration events (skip for running entry — timer is enough) */}
        {!isRunningEntry && !entry.resultDetail && entry.message && entry.message !== entry.event && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-foreground/70 min-w-0 truncate flex-1">{entry.message}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-lg"><p className="break-words">{entry.message}</p></TooltipContent>
          </Tooltip>
        )}

        <span className="flex-1 min-w-0" />

        {/* Duration — right-aligned */}
        {entry.duration && (
          <span className="text-muted-foreground/50 shrink-0 whitespace-nowrap flex items-center gap-0.5">
            <Timer className="h-3 w-3" />{formatDuration(entry.duration)}
          </span>
        )}
        {/* Elapsed timer for running entry — right-aligned */}
        {isRunningEntry && (
          <span className="text-green-600 dark:text-green-400 shrink-0 whitespace-nowrap flex items-center gap-0.5 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" />
            <ElapsedTimer since={entry.timestamp} />
          </span>
        )}

        {/* Expand chevron */}
        {hasExpandable && (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-14 mr-2 mb-1.5 animate-fade-in text-[11px] overflow-hidden min-w-0">
          {/* File changes */}
          {entry.filesChanged.length > 0 && (
            <div className="border-l-2 border-border pl-2 py-1 space-y-0.5">
              <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                <GitCommit className="h-3 w-3" />
                <span className="font-medium">{entry.commitHash && `${entry.commitHash.slice(0, 7)} — `}{entry.filesChanged.length} files</span>
              </div>
              {entry.filesChanged.map((f, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 font-mono">
                      <span className={`shrink-0 w-3 text-center font-bold ${
                        f.type === 'A' ? 'text-green-500' : f.type === 'D' ? 'text-red-500' : f.type === 'R' ? 'text-blue-500' : 'text-yellow-500'
                      }`}>{f.type}</span>
                      <span className="text-foreground/80 truncate flex-1">{f.path}</span>
                      {(f.additions > 0 || f.deletions > 0) && (
                        <span className="text-muted-foreground/60 shrink-0">
                          {f.additions > 0 && <span className="text-green-500">+{f.additions}</span>}
                          {f.additions > 0 && f.deletions > 0 && ' '}
                          {f.deletions > 0 && <span className="text-red-500">-{f.deletions}</span>}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent><p>{f.path}</p></TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Artifacts */}
          {artifacts && artifacts.artifacts.length > 0 && (
            <div className="border-l-2 border-amber-500/30 pl-2 py-1 space-y-0.5 mt-1">
              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <Image className="h-3 w-3" /> {artifacts.artifacts.length} artifact{artifacts.artifacts.length !== 1 ? 's' : ''}
              </span>
              {artifacts.summary && <p className="text-muted-foreground italic text-[10px]">{artifacts.summary}</p>}
              {artifacts.artifacts.map((a) => (
                <div key={a.path} className="flex items-center gap-2">
                  {isImageArtifact(a) ? <Image className="h-3 w-3 text-muted-foreground" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {isImageArtifact(a) ? (
                        <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline truncate" onClick={(e) => { e.stopPropagation(); setLightboxSrc(artifactUrl(artifacts.iteration, a.path)); }}>
                          {a.path}
                        </button>
                      ) : <span className="text-foreground/80 truncate">{a.path}</span>}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-lg"><p className="break-all">{a.path}</p></TooltipContent>
                  </Tooltip>
                  {a.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground/60 truncate">{a.description}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-lg"><p className="break-words">{a.description}</p></TooltipContent>
                    </Tooltip>
                  )}
                  {a.metadata?.diff_percentage !== undefined && (
                    <span className={`shrink-0 text-[9px] px-1 rounded ${a.metadata.diff_percentage < 5 ? 'bg-green-500/20 text-green-500' : a.metadata.diff_percentage < 20 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'}`}>
                      diff: {a.metadata.diff_percentage.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Provider output — rendered inline */}
          {hasOutput && (
            outputLoading ? (
              <div className="ml-2 text-muted-foreground/50 py-1 flex items-center gap-1 text-[11px]"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
            ) : outputText ? (
              <div ref={outputRef} className="border-l-2 border-blue-500/30 pl-2 py-1 mt-1 overflow-auto max-h-48 sm:max-h-64 lg:max-h-[300px] bg-accent/30 rounded-md p-2">
                <div className="prose-dashboard text-[10px] font-mono" dangerouslySetInnerHTML={{ __html: renderAnsiToHtml(outputText) }} />
              </div>
            ) : outputText === '' ? (
              <div className="text-muted-foreground/50 py-1 italic text-[11px] ml-2">No output available</div>
            ) : null
          )}

          {/* Event detail — structured key-value pairs from log entry */}
          {entry.rawObj && (entry.isError || (!entry.filesChanged.length && !artifacts && !hasOutput)) && (
            <div className="border-l-2 border-border pl-2 py-1 space-y-0.5">
              {Object.entries(entry.rawObj)
                .filter(([k]) => !['timestamp', 'ts', 'run_id', 'event', 'type'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 font-mono">
                    <span className="text-muted-foreground/50 shrink-0">{k}:</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-foreground/70 truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-lg"><p className="break-all font-mono text-xs">{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</p></TooltipContent>
                    </Tooltip>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="Artifact" onClose={() => setLightboxSrc(null)} />}
    </>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <button type="button" className="absolute right-4 top-4 text-white text-2xl font-bold hover:text-gray-300" onClick={onClose}>&times;</button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ── Footer ──

function Footer({
  steerInstruction, setSteerInstruction, onSteer, steerSubmitting, onStop, stopSubmitting, onResume, resumeSubmitting, isRunning,
}: {
  steerInstruction: string; setSteerInstruction: (v: string) => void;
  onSteer: () => void; steerSubmitting: boolean;
  onStop: (force: boolean) => void; stopSubmitting: boolean;
  onResume: () => void; resumeSubmitting: boolean;
  isRunning: boolean;
}) {
  return (
    <footer className="border-t border-border px-3 py-2 md:px-4 shrink-0">
      <div className="flex items-center gap-1.5 sm:gap-3">
        <Textarea
          className="min-h-[32px] h-8 resize-none text-xs flex-1 min-w-0"
          placeholder="Steer..."
          value={steerInstruction}
          onChange={(e) => setSteerInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSteer(); } }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" className="h-8 shrink-0 px-2 sm:px-3" disabled={steerSubmitting || !steerInstruction.trim()} onClick={onSteer}>
              <Send className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">{steerSubmitting ? '...' : 'Send'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Send steering instruction (Enter)</p></TooltipContent>
        </Tooltip>
        {isRunning ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="destructive" size="sm" className="h-8 shrink-0 px-2 sm:px-3" disabled={stopSubmitting}>
                <Square className="h-3 w-3" /><span className="hidden sm:inline ml-1">{stopSubmitting ? '...' : 'Stop'}</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStop(false)}>
                  <Square className="h-3.5 w-3.5 mr-2" /> Stop after iteration
                  <span className="ml-auto text-[10px] text-muted-foreground">SIGTERM</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onStop(true)}>
                  <Zap className="h-3.5 w-3.5 mr-2" /> Kill immediately
                  <span className="ml-auto text-[10px] text-muted-foreground">SIGKILL</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="sm" className="h-8 shrink-0 px-2 sm:px-3" disabled={resumeSubmitting} onClick={onResume}>
                <Play className="h-3 w-3" /><span className="hidden sm:inline ml-1">{resumeSubmitting ? '...' : 'Resume'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Resume loop from where it left off</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}

// ── Command Palette ──

function CommandPalette({ open, onClose, sessions, onSelectSession, onStop }: {
  open: boolean; onClose: () => void; sessions: SessionSummary[];
  onSelectSession: (id: string | null) => void; onStop: (force: boolean) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-popover shadow-lg" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => { onClose(); onStop(false); }}>
                <Square className="h-4 w-4 mr-2" /> Stop session (graceful)
              </CommandItem>
              <CommandItem onSelect={() => { onClose(); onStop(true); }}>
                <Zap className="h-4 w-4 mr-2" /> Force stop (SIGKILL)
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Sessions">
              {sessions.map((s) => (
                <CommandItem key={s.id} onSelect={() => { onClose(); onSelectSession(s.id === 'current' ? null : s.id); }}>
                  <div className="flex items-center gap-2">
                    {s.isActive && s.status === 'running' && <StatusDot status="running" />}
                    <span>{s.name}</span>
                    {s.phase && <PhaseBadge phase={s.phase} small />}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}

// ── Main App ──

export function App() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [steerInstruction, setSteerInstruction] = useState('');
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('session'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'docs' | 'activity'>('docs');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const prevPhaseRef = useRef<string>('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSidebarCollapsed((p) => !p); }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCommandOpen((p) => !p); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    setLoading(true);
    setLoadError(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('session', id); else url.searchParams.delete('session');
    window.history.replaceState(null, '', url.toString());
  }, []);

  // SSE + initial fetch
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    const sp = selectedSessionId ? `?session=${encodeURIComponent(selectedSessionId)}` : '';

    async function load() {
      try {
        const r = await fetch(`/api/state${sp}`, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!cancelled) setState(await r.json() as DashboardState);
      } catch (e) { if (!cancelled) setLoadError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    }

    function connectSSE() {
      if (cancelled) return;
      setConnectionStatus('connecting');
      eventSource = new EventSource(`/events${sp}`);
      eventSource.addEventListener('state', (evt) => {
        try {
          setState(JSON.parse((evt as MessageEvent<string>).data) as DashboardState);
          setLoadError(null); setConnectionStatus('connected'); reconnectDelay = 1000;
        } catch (e) { setLoadError((e as Error).message); }
      });
      eventSource.addEventListener('heartbeat', () => { setConnectionStatus('connected'); });
      eventSource.onopen = () => { setConnectionStatus('connected'); reconnectDelay = 1000; };
      eventSource.onerror = () => {
        setConnectionStatus('disconnected'); eventSource?.close(); eventSource = null;
        if (!cancelled) { reconnectTimer = setTimeout(connectSSE, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); }
      };
    }

    load().catch(() => undefined);
    connectSSE();
    return () => { cancelled = true; controller.abort(); eventSource?.close(); if (reconnectTimer) clearTimeout(reconnectTimer); };
  }, [selectedSessionId]);

  const sessions = useMemo<SessionSummary[]>(() => {
    if (!state) return [{ id: 'current', name: 'Current', projectName: 'Unknown', status: 'unknown', phase: '', elapsed: '--', iterations: '--', isActive: false, branch: '', startedAt: '', endedAt: '', pid: '', provider: '', workDir: '', stuckCount: 0 }];
    const active = (state.activeSessions ?? []).filter(isRecord).map((e, i) => toSession(e, `active-${i}`, true));
    const recent = (state.recentSessions ?? []).filter(isRecord).slice(-10).reverse().map((e, i) => toSession(e, `recent-${i}`, false));
    const combined = [...active, ...recent];
    if (combined.length > 0) return combined;
    if (isRecord(state.status)) return [toSession(state.status, state.workdir, true)];
    return [{ id: 'current', name: state.workdir, projectName: 'Unknown', status: 'unknown', phase: '', elapsed: '--', iterations: '--', isActive: false, branch: '', startedAt: '', endedAt: '', pid: '', provider: '', workDir: '', stuckCount: 0 }];
  }, [state]);

  const statusRecord = isRecord(state?.status) ? state.status : null;
  const currentPhase = statusRecord ? str(statusRecord, ['mode', 'phase']) : '';
  const currentState = statusRecord ? str(statusRecord, ['state', 'status'], 'unknown') : 'unknown';
  const currentIteration = statusRecord ? numStr(statusRecord, ['iteration', 'iterations']) : '--';
  const currentIterationNum = statusRecord ? (typeof statusRecord.iteration === 'number' ? statusRecord.iteration : null) : null;
  const providerName = statusRecord ? str(statusRecord, ['provider', 'current_provider']) : '';
  const modelName = statusRecord ? str(statusRecord, ['model', 'current_model']) : '';
  const stuckCount = statusRecord && typeof statusRecord.stuck_count === 'number' ? statusRecord.stuck_count : 0;
  const isRunning = currentState === 'running';
  const startedAt = statusRecord ? str(statusRecord, ['started_at', 'startedAt']) : '';
  const iterationStartedAt = statusRecord ? str(statusRecord, ['iteration_started_at']) : '';
  const metaRecord = isRecord(state?.meta) ? state.meta : null;
  const maxIterations = metaRecord && typeof metaRecord.max_iterations === 'number' ? metaRecord.max_iterations : null;
  const avgDuration = useMemo(() => computeAvgDuration(state?.log ?? ''), [state?.log]);

  useEffect(() => {
    if (currentPhase && prevPhaseRef.current && currentPhase !== prevPhaseRef.current) {
      toast(`Phase: ${prevPhaseRef.current} \u2192 ${currentPhase}`, { description: `Iteration ${currentIteration}` });
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase, currentIteration]);

  const todoContent = state?.docs?.['TODO.md'] ?? '';
  const { completed: tasksCompleted, total: tasksTotal } = useMemo(() => parseTodoProgress(todoContent), [todoContent]);
  const progressPercent = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  const providerHealth = useMemo(() => deriveProviderHealth(state?.log ?? ''), [state?.log]);

  const currentSession = sessions.find((s) => selectedSessionId === null ? sessions.indexOf(s) === 0 : s.id === selectedSessionId);
  const sessionName = currentSession?.name ?? 'No session';

  const handleSteer = useCallback(async () => {
    if (!steerInstruction.trim() || steerSubmitting) return;
    setSteerSubmitting(true);
    try {
      const r = await fetch('/api/steer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: steerInstruction.trim() }) });
      if (!r.ok) { const p = await r.json() as { error?: string }; throw new Error(p.error ?? `HTTP ${r.status}`); }
      setSteerInstruction(''); toast.success('Steering instruction queued.');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSteerSubmitting(false); }
  }, [steerInstruction, steerSubmitting]);

  const handleStop = useCallback(async (force: boolean) => {
    if (stopSubmitting) return;
    setStopSubmitting(true);
    try {
      const r = await fetch('/api/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(force ? { force: true } : {}) });
      if (!r.ok) { const p = await r.json() as { error?: string }; throw new Error(p.error ?? `HTTP ${r.status}`); }
      const p = await r.json() as { signal?: string };
      toast.info(`Stop requested (${p.signal ?? 'SIGTERM'}).`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setStopSubmitting(false); }
  }, [stopSubmitting]);

  const [resumeSubmitting, setResumeSubmitting] = useState(false);
  const handleResume = useCallback(async () => {
    if (resumeSubmitting) return;
    setResumeSubmitting(true);
    try {
      const r = await fetch('/api/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!r.ok) { const p = await r.json() as { error?: string }; throw new Error(p.error ?? `HTTP ${r.status}`); }
      const p = await r.json() as { pid?: number };
      toast.success(`Loop resumed (PID ${p.pid}).`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setResumeSubmitting(false); }
  }, [resumeSubmitting]);

  const docsPanel = (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'docs' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <DocsPanel docs={state?.docs ?? {}} providerHealth={providerHealth} activityCollapsed={activityCollapsed} repoUrl={state?.repoUrl} />
      </CardContent>
    </Card>
  );

  const activityPanel = activityCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={`shrink-0 flex-col items-center gap-1 px-1 py-2 text-muted-foreground hover:text-foreground transition-colors hidden lg:flex ${activePanel !== 'activity' ? 'hidden lg:flex' : 'flex'}`} onClick={() => setActivityCollapsed(false)}>
          <PanelLeftOpen className="h-4 w-4" />
          <span className="text-[9px] uppercase tracking-wider font-medium [writing-mode:vertical-lr]">Activity</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left"><p>Show activity panel</p></TooltipContent>
    </Tooltip>
  ) : (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'activity' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> Activity</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground/50 hover:text-foreground transition-colors hidden lg:block" onClick={() => setActivityCollapsed(true)}>
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Collapse activity panel</p></TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <ActivityPanel log={state?.log ?? ''} artifacts={state?.artifacts ?? []} currentIteration={isRunning ? currentIterationNum : null} currentPhase={currentPhase} currentProvider={providerName} isRunning={isRunning} iterationStartedAt={iterationStartedAt} />
      </CardContent>
    </Card>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        <div className="flex flex-1 min-h-0">
          {/* Desktop sidebar */}
          <div className="hidden md:flex">
            <Sidebar sessions={sessions} selectedSessionId={selectedSessionId} onSelectSession={selectSession} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          </div>
          {/* Mobile sidebar drawer */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 md:hidden animate-fade-in" onClick={() => setMobileMenuOpen(false)}>
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative h-full w-64 max-w-[80vw] bg-background animate-slide-in-left" onClick={(e) => e.stopPropagation()}>
                <Sidebar sessions={sessions} selectedSessionId={selectedSessionId} onSelectSession={(id) => { selectSession(id); setMobileMenuOpen(false); }} collapsed={false} onToggle={() => setMobileMenuOpen(false)} />
              </div>
            </div>
          )}
          <div className="flex flex-col flex-1 min-w-0">
            <Header sessionName={sessionName} isRunning={isRunning} currentState={currentState} currentPhase={currentPhase} currentIteration={currentIteration} providerName={providerName} modelName={modelName} tasksCompleted={tasksCompleted} tasksTotal={tasksTotal} progressPercent={progressPercent} updatedAt={state?.updatedAt ?? ''} loading={loading} loadError={loadError} connectionStatus={connectionStatus} onOpenCommand={() => setCommandOpen(true)} onOpenSwitcher={() => setSidebarCollapsed(false)} startedAt={startedAt} avgDuration={avgDuration} maxIterations={maxIterations} stuckCount={stuckCount} onToggleMobileMenu={() => setMobileMenuOpen((p) => !p)} />
            {/* Mobile panel toggle */}
            <div className="lg:hidden flex border-b border-border shrink-0">
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${activePanel === 'docs' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setActivePanel('docs')}
              >
                <FileText className="h-3.5 w-3.5 inline mr-1" />Documents
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${activePanel === 'activity' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setActivePanel('activity')}
              >
                <Activity className="h-3.5 w-3.5 inline mr-1" />Activity
              </button>
            </div>
            <main className="flex-1 min-h-0 p-2 md:p-3">
              <div className="flex gap-3 h-full">
                {docsPanel}
                {activityPanel}
              </div>
            </main>
            <Footer steerInstruction={steerInstruction} setSteerInstruction={setSteerInstruction} onSteer={() => void handleSteer()} steerSubmitting={steerSubmitting} onStop={(f) => void handleStop(f)} stopSubmitting={stopSubmitting} onResume={() => void handleResume()} resumeSubmitting={resumeSubmitting} isRunning={isRunning} />
          </div>
        </div>
        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} sessions={sessions} onSelectSession={selectSession} onStop={(f) => void handleStop(f)} />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
