import * as view from './AppView';

export const App = view.App;
export const Sidebar = view.Sidebar;
export const ActivityPanel = view.ActivityPanel;
export const DocContent = view.DocContent;
export const HealthPanel = view.HealthPanel;
export const SIGNIFICANT_EVENTS = view.SIGNIFICANT_EVENTS;
export const IMAGE_EXT = view.IMAGE_EXT;

export function stripAnsi(text: string): string { return view.stripAnsi(text); }
export function rgbStr(r: number, g: number, b: number): string { return view.rgbStr(r, g, b); }
export function parseAnsiSegments(text: string) { return view.parseAnsiSegments(text); }
export function renderAnsiToHtml(text: string, opts: { gfm?: boolean; breaks?: boolean } = {}): string {
  return view.renderAnsiToHtml(text, opts);
}

export function isRecord(v: unknown): v is Record<string, unknown> { return view.isRecord(v); }
export function str(source: Record<string, unknown>, keys: string[], fb = ''): string { return view.str(source, keys, fb); }
export function numStr(source: Record<string, unknown>, keys: string[], fb = '--'): string { return view.numStr(source, keys, fb); }
export function toSession(source: Record<string, unknown>, fallback: string, isActive: boolean) {
  return view.toSession(source, fallback, isActive);
}

export function formatTime(ts: string): string { return view.formatTime(ts); }
export function formatTimeShort(ts: string): string { return view.formatTimeShort(ts); }
export function formatSecs(total: number): string { return view.formatSecs(total); }
export function formatDuration(raw: string): string { return view.formatDuration(raw); }
export function formatDateKey(ts: string): string { return view.formatDateKey(ts); }
export function relativeTime(ts: string): string { return view.relativeTime(ts); }

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
