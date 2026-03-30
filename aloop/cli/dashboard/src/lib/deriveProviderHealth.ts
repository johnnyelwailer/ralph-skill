import type { ProviderHealth } from '@/components/health/ProviderHealth';
import { isRecord, str } from './activityLogHelpers';

export function deriveProviderHealth(log: string, configuredProviders?: string[]): ProviderHealth[] {
  const providers = new Map<string, ProviderHealth>();

  // Seed configured providers as baseline with 'unknown' status
  if (configuredProviders) {
    for (const name of configuredProviders) {
      if (name) providers.set(name, { name, status: 'unknown', lastEvent: '' });
    }
  }

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
        if (!providers.has(provider) || providers.get(provider)!.status === 'unknown') {
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
