export interface ArtifactManifest { iteration: number; manifest: unknown; outputHeader?: string }

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

export interface FileChange {
  path: string;
  type: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
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

export interface IterationUsage {
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  cost_usd: number;
}
