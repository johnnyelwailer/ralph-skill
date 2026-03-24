import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HealthPanel } from './ProviderHealth';
import type { ProviderHealth } from './ProviderHealth';

function renderHealthPanel(providers: ProviderHealth[]) {
  return render(
    <TooltipProvider>
      <HealthPanel providers={providers} />
    </TooltipProvider>,
  );
}

describe('HealthPanel', () => {
  it('renders empty state message when no providers', () => {
    renderHealthPanel([]);
    expect(screen.getByText('No provider data yet.')).toBeInTheDocument();
  });

  it('renders provider name', () => {
    renderHealthPanel([{ name: 'claude', status: 'healthy', lastEvent: '' }]);
    expect(screen.getByText('claude')).toBeInTheDocument();
  });

  it('shows "healthy" status text for healthy provider', () => {
    renderHealthPanel([{ name: 'claude', status: 'healthy', lastEvent: '' }]);
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('shows "no activity" for unknown provider', () => {
    renderHealthPanel([{ name: 'codex', status: 'unknown', lastEvent: '' }]);
    expect(screen.getByText('no activity')).toBeInTheDocument();
  });

  it('shows "failed" status text for failed provider', () => {
    renderHealthPanel([{ name: 'gemini', status: 'failed', lastEvent: '' }]);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('shows cooldown label for cooldown provider with future cooldownUntil', () => {
    const cooldownUntil = new Date(Date.now() + 15 * 60_000).toISOString();
    renderHealthPanel([{ name: 'opencode', status: 'cooldown', lastEvent: '', cooldownUntil }]);
    expect(screen.getByText(/cooldown for/)).toBeInTheDocument();
  });

  it('shows "cooldown ending…" when cooldownUntil is in the past', () => {
    const cooldownUntil = new Date(Date.now() - 1000).toISOString();
    renderHealthPanel([{ name: 'opencode', status: 'cooldown', lastEvent: '', cooldownUntil }]);
    expect(screen.getByText('cooldown ending…')).toBeInTheDocument();
  });

  it('renders all providers in the list', () => {
    renderHealthPanel([
      { name: 'claude', status: 'healthy', lastEvent: '' },
      { name: 'gemini', status: 'failed', lastEvent: '' },
      { name: 'codex', status: 'unknown', lastEvent: '' },
    ]);
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('gemini')).toBeInTheDocument();
    expect(screen.getByText('codex')).toBeInTheDocument();
  });

  it('shows "just now" for a very recent lastEvent timestamp', () => {
    const now = new Date().toISOString();
    renderHealthPanel([{ name: 'claude', status: 'healthy', lastEvent: now }]);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows relative minutes for lastEvent a few minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    renderHealthPanel([{ name: 'claude', status: 'healthy', lastEvent: fiveMinAgo }]);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('shows relative hours for lastEvent a few hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    renderHealthPanel([{ name: 'claude', status: 'healthy', lastEvent: twoHoursAgo }]);
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('shows empty string for missing lastEvent', () => {
    const { container } = renderHealthPanel([{ name: 'claude', status: 'healthy', lastEvent: '' }]);
    // The time span should be empty (relativeTime returns '' for empty input)
    const timeSpans = container.querySelectorAll('.text-\\[10px\\]');
    expect(timeSpans[0].textContent).toBe('');
  });
});
