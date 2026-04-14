// Shared type and interface declarations for the dashboard.

export type SessionStatus = Record<string, unknown>;

export interface ArtifactManifest {
  iteration: number;
  manifest: unknown;
  outputHeader?: string;
}

export interface DashboardState {
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
  meta: Record<string, unknown> | null;
}

export interface SessionSummary {
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

export interface FileChange {
  path: string;
  type: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
}

export interface LogEntry {
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

export interface ArtifactEntry {
  type: string;
  path: string;
  description: string;
  metadata?: { baseline?: string; diff_percentage?: number };
}

export interface ManifestPayload {
  iteration: number;
  phase: string;
  summary: string;
  artifacts: ArtifactEntry[];
  outputHeader?: string;
}

export interface ProviderHealth {
  name: string;
  status: 'healthy' | 'cooldown' | 'failed' | 'unknown';
  lastEvent: string;
  reason?: string;
  consecutiveFailures?: number;
  cooldownUntil?: string;
}

export interface QACoverageFeature {
  feature: string;
  component: string;
  last_tested: string;
  commit: string;
  status: 'PASS' | 'FAIL' | 'UNTESTED';
  criteria_met: string;
  notes: string;
}

export interface QACoverageViewData {
  percentage: number | null;
  available: boolean;
  features: QACoverageFeature[];
}

export interface CostSessionResponse {
  total_usd?: number | string;
  error?: string;
}

export interface IterationUsage {
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  cost_usd: number;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
