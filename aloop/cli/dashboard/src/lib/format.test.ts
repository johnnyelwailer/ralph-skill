import { describe, expect, it } from 'vitest';
import {
  artifactUrl,
  deriveProviderHealth,
  findBaselineIterations,
  formatTokenCount,
  IMAGE_EXT,
  isImageArtifact,
} from './format';
import type { ArtifactEntry, ManifestPayload } from '../types';

describe('formatTokenCount', () => {
  it('formats numbers below 1000 as plain strings', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(15200)).toBe('15.2k');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
  });
});

describe('isImageArtifact', () => {
  it('returns true for image extensions', () => {
    for (const ext of IMAGE_EXT) {
      const a: ArtifactEntry = { type: 'file', path: `img${ext}`, description: '' };
      expect(isImageArtifact(a)).toBe(true);
    }
  });

  it('returns true for screenshot and visual_diff types', () => {
    expect(isImageArtifact({ type: 'screenshot', path: 'no-ext', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'visual_diff', path: 'no-ext', description: '' })).toBe(true);
  });

  it('returns false for non-image artifacts', () => {
    expect(isImageArtifact({ type: 'file', path: 'report.pdf', description: '' })).toBe(false);
  });
});

describe('artifactUrl', () => {
  it('returns correct API path with encoded filename', () => {
    expect(artifactUrl(3, 'my file.png')).toBe('/api/artifacts/3/my%20file.png');
  });
});

describe('findBaselineIterations', () => {
  const manifests: ManifestPayload[] = [
    { iteration: 1, phase: 'build', summary: '', artifacts: [{ type: 'f', path: 'a.png', description: '' }] },
    { iteration: 2, phase: 'build', summary: '', artifacts: [{ type: 'f', path: 'b.png', description: '' }] },
    { iteration: 3, phase: 'build', summary: '', artifacts: [{ type: 'f', path: 'a.png', description: '' }] },
    { iteration: 4, phase: 'build', summary: '', artifacts: [{ type: 'f', path: 'a.png', description: '' }] },
  ];

  it('returns iterations older than current with matching artifact, newest first', () => {
    expect(findBaselineIterations('a.png', 4, manifests)).toEqual([3, 1]);
  });

  it('returns empty array when no older iteration has the artifact', () => {
    expect(findBaselineIterations('a.png', 1, manifests)).toEqual([]);
  });
});

describe('deriveProviderHealth', () => {
  it('returns empty array for empty log', () => {
    expect(deriveProviderHealth('')).toEqual([]);
  });

  it('seeds configured providers as unknown', () => {
    const result = deriveProviderHealth('', ['alpha', 'beta']);
    expect(result.map((p) => p.name)).toEqual(['alpha', 'beta']);
    expect(result.every((p) => p.status === 'unknown')).toBe(true);
  });

  it('marks provider healthy on iteration_complete', () => {
    const line = JSON.stringify({ event: 'iteration_complete', provider: 'openai', timestamp: 't1' });
    const [p] = deriveProviderHealth(line);
    expect(p.status).toBe('healthy');
    expect(p.name).toBe('openai');
  });

  it('marks provider cooldown on provider_cooldown event', () => {
    const line = JSON.stringify({
      event: 'provider_cooldown', provider: 'openai', timestamp: 't1',
      reason: 'rate_limit', consecutive_failures: 2, cooldown_until: 'T+30s',
    });
    const [p] = deriveProviderHealth(line);
    expect(p.status).toBe('cooldown');
    expect(p.consecutiveFailures).toBe(2);
    expect(p.cooldownUntil).toBe('T+30s');
  });

  it('marks provider healthy on provider_recovered event', () => {
    const cooldown = JSON.stringify({ event: 'provider_cooldown', provider: 'openai', timestamp: 't1' });
    const recovered = JSON.stringify({ event: 'provider_recovered', provider: 'openai', timestamp: 't2' });
    const [p] = deriveProviderHealth([cooldown, recovered].join('\n'));
    expect(p.status).toBe('healthy');
  });

  it('sorts providers by name', () => {
    const lines = [
      JSON.stringify({ event: 'iteration_complete', provider: 'zeta', timestamp: 't1' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'alpha', timestamp: 't1' }),
    ].join('\n');
    const names = deriveProviderHealth(lines).map((p) => p.name);
    expect(names).toEqual(['alpha', 'zeta']);
  });
});
