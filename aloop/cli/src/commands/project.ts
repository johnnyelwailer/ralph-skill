import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Re-export from the stable .mjs core
// @ts-expect-error: Untyped .mjs core module
import * as projectCore from '../../lib/project.mjs';

export type OutputMode = 'json' | 'text';

export interface BaseOptions {
  projectRoot?: string;
  homeDir?: string;
}

export interface DiscoverOptions extends BaseOptions {}

export interface ScaffoldOptions extends BaseOptions {
  language?: string;
  provider?: string;
  enabledProviders?: string[];
  roundRobinOrder?: string[];
  specFiles?: string[];
  referenceFiles?: string[];
  validationCommands?: string[];
  safetyRules?: string[];
  mode?: string;
  templatesDir?: string;
}

export interface DiscoveryResult {
  project: {
    root: string;
    name: string;
    hash: string;
    is_git_repo: boolean;
    git_branch: string | null;
  };
  setup: {
    project_dir: string;
    config_path: string;
    config_exists: boolean;
    templates_dir: string;
  };
  context: {
    detected_language: string;
    language_confidence: 'high' | 'medium' | 'low';
    language_signals: string[];
    validation_presets: {
      tests_only: string[];
      tests_and_types: string[];
      full: string[];
    };
    spec_candidates: string[];
    reference_candidates: string[];
    context_files: Record<string, boolean>;
  };
  providers: {
    installed: string[];
    missing: string[];
    default_provider: string;
    default_models: Record<string, string>;
    round_robin_default: string[];
  };
  discovered_at: string;
}

export interface ScaffoldResult {
  config_path: string;
  prompts_dir: string;
  project_dir: string;
  project_hash: string;
}

export const discoverWorkspace = projectCore.discoverWorkspace as (options?: DiscoverOptions) => Promise<DiscoveryResult>;
export const scaffoldWorkspace = projectCore.scaffoldWorkspace as (options?: ScaffoldOptions) => Promise<ScaffoldResult>;
export const assertProjectConfigured = projectCore.assertProjectConfigured as (discovery: DiscoveryResult) => void;
export const resolveProjectRoot = projectCore.resolveProjectRoot as (projectRoot?: string) => string;
export const getProjectHash = projectCore.getProjectHash as (projectPath: string) => string;
export const getHomeDir = projectCore.getHomeDir as (explicit?: string) => string;
