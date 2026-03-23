// Pure time/string formatting functions

export function formatTime(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ts; }
}

export function formatTimeShort(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ts; }
}

export function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatDuration(raw: string): string {
  const match = raw.match(/^(\d+)s$/);
  if (!match) return raw;
  return formatSecs(parseInt(match[1], 10));
}

export function formatDateKey(ts: string): string {
  if (!ts) return 'Unknown';
  try { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'Unknown'; }
}

export function relativeTime(ts: string): string {
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

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}
