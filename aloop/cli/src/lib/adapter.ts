/**
 * OrchestratorAdapter — re-export barrel.
 *
 * Splits:
 *   - adapter-interface.ts  — shared interface types (AdapterConfig, PrChecksResult, OrchestratorAdapter)
 *   - adapter-github-project.ts — GitHub Projects v2 status helpers
 *   - adapter-github.ts     — GitHubAdapter implementation + createAdapter factory
 */

export type { AdapterConfig, PrChecksResult, OrchestratorAdapter } from './adapter-interface.js';
export { GitHubAdapter, createAdapter } from './adapter-github.js';
