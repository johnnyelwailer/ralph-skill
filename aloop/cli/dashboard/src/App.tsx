import * as view from './AppView';
import { Sidebar } from './components/shared/Sidebar';
import { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';
import { isRecord, str, numStr, toSession, formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey, relativeTime } from './lib/format';

export { Sidebar };
export const App = view.App;
export { ActivityPanel, DocContent, HealthPanel, SIGNIFICANT_EVENTS, IMAGE_EXT } from './AppView';
export { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml };
export { isRecord, str, numStr, toSession, formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey, relativeTime };

export function parseLogLine(line: string) { return view.parseLogLine(line); }
export function isImageArtifact(a: { type: string; path: string; description: string; metadata?: { baseline?: string; diff_percentage?: number } }) {
  return view.isImageArtifact(a);
}
export function artifactUrl(iter: number, file: string) { return view.artifactUrl(iter, file); }
export function parseManifest(am: { iteration: number; manifest: unknown; outputHeader?: string }) {
  return view.parseManifest(am);
}

export function extractIterationUsage(rawObj: Record<string, unknown> | null) { return view.extractIterationUsage(rawObj); }
export function formatTokenCount(n: number): string { return view.formatTokenCount(n); }

export function extractModelFromOutput(header?: string): string { return view.extractModelFromOutput(header); }
export function parseDurationSeconds(raw: string): number | null { return view.parseDurationSeconds(raw); }
export function computeAvgDuration(log: string): string { return view.computeAvgDuration(log); }
export function deriveProviderHealth(log: string, configuredProviders?: string[]) { return view.deriveProviderHealth(log, configuredProviders); }
export function slugify(text: string): string { return view.slugify(text); }

export function findBaselineIterations(
  artifactPath: string,
  currentIteration: number,
  allManifests: Array<{ iteration: number; phase: string; summary: string; artifacts: Array<{ type: string; path: string; description: string; metadata?: { baseline?: string; diff_percentage?: number } }>; outputHeader?: string }>,
): number[] {
  return view.findBaselineIterations(artifactPath, currentIteration, allManifests);
}

export function ArtifactComparisonDialog(
  props: {
    artifact: { type: string; path: string; description: string; metadata?: { baseline?: string; diff_percentage?: number } };
    currentIteration: number;
    allManifests: Array<{ iteration: number; phase: string; summary: string; artifacts: Array<{ type: string; path: string; description: string; metadata?: { baseline?: string; diff_percentage?: number } }>; outputHeader?: string }>;
    onClose: () => void;
  },
) {
  return view.ArtifactComparisonDialog(props);
}
