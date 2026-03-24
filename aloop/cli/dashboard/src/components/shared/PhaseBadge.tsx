const phaseColors: Record<string, string> = {
  plan: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  build: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  proof: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
};

export function PhaseBadge({ phase, small }: { phase: string; small?: boolean }) {
  if (!phase) return null;
  const colors = phaseColors[phase.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  const size = small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs';
  return <span className={`inline-block rounded border font-medium ${colors} ${size}`}>{phase}</span>;
}
