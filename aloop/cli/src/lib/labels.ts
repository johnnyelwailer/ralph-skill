/**
 * Label derivation utilities for GH issue enrichment.
 */

/** Ordered mapping from path pattern to component label. First match wins. */
const COMPONENT_MAPPINGS: Array<{ test: (p: string) => boolean; label: string }> = [
  { test: (p) => p.includes('dashboard'), label: 'component/dashboard' },
  { test: (p) => /(?:^|\/)loop\.(sh|ps1)$/.test(p), label: 'component/loop' },
  { test: (p) => p.includes('orchestrate'), label: 'component/orchestrator' },
  { test: (p) => p.includes('cli/'), label: 'component/cli' },
];

/**
 * Derives component labels from a list of file hints.
 *
 * Applies first-match-wins per file and returns unique labels.
 */
export function deriveComponentLabels(file_hints: string[]): string[] {
  const labels = new Set<string>();
  for (const filePath of file_hints) {
    for (const mapping of COMPONENT_MAPPINGS) {
      if (mapping.test(filePath)) {
        labels.add(mapping.label);
        break;
      }
    }
  }
  return Array.from(labels);
}
