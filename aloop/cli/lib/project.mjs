import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, readdir, stat, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {Object} DiscoveryResult
 * @property {Object} project
 * @property {string} project.root
 * @property {string} project.name
 * @property {string} project.hash
 * @property {boolean} project.is_git_repo
 * @property {string|null} project.git_branch
 * @property {Object} setup
 * @property {string} setup.project_dir
 * @property {string} setup.config_path
 * @property {boolean} setup.config_exists
 * @property {string} setup.templates_dir
 * @property {Object} context
 * @property {string} context.detected_language
 * @property {'high'|'medium'|'low'} context.language_confidence
 * @property {string[]} context.language_signals
 * @property {Object} context.validation_presets
 * @property {string[]} context.validation_presets.tests_only
 * @property {string[]} context.validation_presets.tests_and_types
 * @property {string[]} context.validation_presets.full
 * @property {string[]} context.spec_candidates
 * @property {string[]} context.reference_candidates
 * @property {Record<string, boolean>} context.context_files
 * @property {Object} providers
 * @property {string[]} providers.installed
 * @property {string[]} providers.missing
 * @property {string} providers.default_provider
 * @property {Record<string, string>} providers.default_models
 * @property {string[]} providers.round_robin_default
 * @property {Object} devcontainer
 * @property {boolean} devcontainer.enabled
 * @property {string|null} devcontainer.config_path
 * @property {string} discovered_at
 */

export function getHomeDir(explicit) {
  return path.resolve(explicit ?? os.homedir()).replace(/[\\\/]+$/, '');
}

export function resolveProjectRoot(projectRoot) {
  const start = path.resolve(projectRoot ?? process.cwd());
  const gitRoot = spawnSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (gitRoot.status === 0) {
    const value = gitRoot.stdout.trim();
    if (value) {
      return path.resolve(value);
    }
  }
  return start;
}

export function getProjectHash(projectPath) {
  const normalized = path.resolve(projectPath).replace(/[\\\/]+$/, '').toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

export function detectGit(projectRoot) {
  const isGit = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (isGit.status !== 0) {
    return { isGitRepo: false, gitBranch: null };
  }
  const branch = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return { isGitRepo: true, gitBranch: branch.status === 0 ? branch.stdout.trim() || null : null };
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() || info.isDirectory();
  } catch {
    return false;
  }
}

async function detectLanguage(projectRoot) {
  const score = {
    'node-typescript': 0,
    python: 0,
    go: 0,
    rust: 0,
    dotnet: 0,
  };
  const signals = [];

  const checks = [
    { rel: 'package.json', language: 'node-typescript', points: 4 },
    { rel: 'tsconfig.json', language: 'node-typescript', points: 3 },
    { rel: 'pnpm-lock.yaml', language: 'node-typescript', points: 2 },
    { rel: 'yarn.lock', language: 'node-typescript', points: 2 },
    { rel: 'pyproject.toml', language: 'python', points: 4 },
    { rel: 'requirements.txt', language: 'python', points: 3 },
    { rel: 'setup.py', language: 'python', points: 2 },
    { rel: 'go.mod', language: 'go', points: 5 },
    { rel: 'Cargo.toml', language: 'rust', points: 5 },
  ];

  for (const check of checks) {
    if (await fileExists(path.join(projectRoot, check.rel))) {
      score[check.language] += check.points;
      signals.push(check.rel);
    }
  }

  const dotnetFiles = await readdir(projectRoot).catch(() => []);
  if (dotnetFiles.some((item) => item.endsWith('.sln'))) {
    score.dotnet += 4;
    signals.push('*.sln');
  }

  let winner = 'other';
  let winnerScore = 0;
  for (const [language, points] of Object.entries(score)) {
    if (points > winnerScore) {
      winner = language;
      winnerScore = points;
    }
  }

  const confidence = winnerScore >= 5 ? 'high' : winnerScore >= 3 ? 'medium' : 'low';
  return { language: winner, confidence, signals };
}

async function getPackageScripts(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!(await fileExists(packagePath))) {
    return {};
  }
  try {
    const raw = await readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

async function buildValidationPresets(language, projectRoot) {
  if (language === 'node-typescript') {
    const scripts = await getPackageScripts(projectRoot);
    const test = scripts.test ? 'npm test' : 'npx vitest run';
    const typecheck = scripts.typecheck ? 'npm run typecheck' : (await fileExists(path.join(projectRoot, 'tsconfig.json'))) ? 'npx tsc --noEmit' : null;
    const lint = scripts.lint ? 'npm run lint' : 'npx eslint .';
    const build = scripts.build ? 'npm run build' : null;
    const testsAndTypes = [typecheck, test].filter((value) => Boolean(value));
    const full = [typecheck, lint, test, build].filter((value) => Boolean(value));
    return { tests_only: [test], tests_and_types: testsAndTypes, full };
  }

  if (language === 'python') {
    return { tests_only: ['pytest'], tests_and_types: ['mypy .', 'pytest'], full: ['mypy .', 'ruff check .', 'pytest'] };
  }
  if (language === 'go') {
    return { tests_only: ['go test ./...'], tests_and_types: ['go vet ./...', 'go test ./...'], full: ['go vet ./...', 'golangci-lint run', 'go test ./...'] };
  }
  if (language === 'rust') {
    return { tests_only: ['cargo test'], tests_and_types: ['cargo clippy -- -D warnings', 'cargo test'], full: ['cargo clippy -- -D warnings', 'cargo test', 'cargo build --release'] };
  }
  if (language === 'dotnet') {
    return { tests_only: ['dotnet test'], tests_and_types: ['dotnet build', 'dotnet test'], full: ['dotnet build', 'dotnet test'] };
  }

  return { tests_only: [], tests_and_types: [], full: [] };
}

async function discoverSpecCandidates(projectRoot) {
  const ordered = ['SPEC.md', 'README.md', 'docs/SPEC.md', 'docs/spec.md', 'requirements.md', 'PRD.md', 'specs', 'docs'];
  const found = [];
  for (const rel of ordered) {
    if (await fileExists(path.join(projectRoot, rel))) {
      found.push(rel.replace(/\\/g, '/'));
    }
  }
  return found;
}

/**
 * Analyze spec file content for complexity signals.
 * Returns workstream count, parallelism potential, and estimated issue count.
 * @param {string} projectRoot
 * @param {string[]} specCandidates
 * @returns {Promise<Object>}
 */
// Canonical workstream categories — synonyms map to one category to prevent
// overlap overcounting (e.g., "infra" and "infrastructure").
const WORKSTREAM_CATEGORIES = {
  frontend: 'frontend',
  backend: 'backend',
  infrastructure: 'infrastructure',
  infra: 'infrastructure',
  api: 'api',
  ui: 'ui',
  database: 'database',
  db: 'database',
  auth: 'auth',
  authentication: 'auth',
  deployment: 'deployment',
  devops: 'devops',
  mobile: 'mobile',
  web: 'web',
  cli: 'cli',
  sdk: 'sdk',
  library: 'library',
  service: 'service',
  microservice: 'service',
  integration: 'integration',
};
const WORKSTREAM_MATCHERS = Object.entries(WORKSTREAM_CATEGORIES).map(([keyword, category]) => ({
  category,
  regex: new RegExp(`\\b${keyword}\\b`, 'i'),
}));

async function analyzeSpecComplexity(projectRoot, specCandidates) {
  const parallelismKeywords = [
    'parallel', 'concurrent', 'simultaneous', 'independent', 'separate',
    'decoupled', 'async', 'asynchronous', 'fan-out', 'fanout', 'multi-track',
    'workstream', 'workstreams',
  ];

  const discoveredWorkstreams = new Set();
  let fallbackWorkstreamFiles = 0;
  let totalParallelismSignals = 0;
  let totalEstimatedIssues = 0;
  let analyzedFiles = 0;

  for (const specFile of specCandidates) {
    const specPath = path.join(projectRoot, specFile);
    if (!existsSync(specPath)) continue;
    try {
      const content = await readFile(specPath, 'utf8');
      const lowered = content.toLowerCase();
      analyzedFiles++;

      // Count distinct workstream categories from H2/H3 headers.
      const headerLines = content.split(/\r?\n/).filter(line => /^#{2,3}\s/.test(line));
      const uniqueFileCategories = new Set();
      for (const header of headerLines) {
        for (const matcher of WORKSTREAM_MATCHERS) {
          if (matcher.regex.test(header)) {
            uniqueFileCategories.add(matcher.category);
          }
        }
      }
      for (const category of uniqueFileCategories) {
        discoveredWorkstreams.add(category);
      }
      if (uniqueFileCategories.size === 0 && headerLines.length > 0) {
        fallbackWorkstreamFiles += 1;
      }

      // Count parallelism signals
      for (const kw of parallelismKeywords) {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        const matches = lowered.match(regex);
        if (matches) totalParallelismSignals += matches.length;
      }

      // Estimate issue count: count task-like headers (H2/H3) and bullet items with acceptance criteria
      const taskHeaders = headerLines.length;
      const acceptanceCriteria = (content.match(/acceptance criteria/gi) || []).length;
      const checkboxItems = (content.match(/^\s*-\s+\[[ x]\]/gim) || []).length;
      totalEstimatedIssues += Math.max(taskHeaders, acceptanceCriteria > 0 ? acceptanceCriteria + checkboxItems : checkboxItems, taskHeaders > 0 ? taskHeaders : 1);
    } catch {
      // Skip unreadable spec files
    }
  }

  const workstreamCount = discoveredWorkstreams.size > 0
    ? discoveredWorkstreams.size
    : (fallbackWorkstreamFiles > 0 ? fallbackWorkstreamFiles : 1);
  const parallelismScore = totalParallelismSignals;
  const estimatedIssueCount = totalEstimatedIssues > 0 ? totalEstimatedIssues : 1;

  return {
    workstream_count: workstreamCount,
    parallelism_score: parallelismScore,
    estimated_issue_count: estimatedIssueCount,
    analyzed_files: analyzedFiles,
  };
}

/**
 * Detect CI workflow support in the project.
 * @param {string} projectRoot
 * @returns {Promise<Object>}
 */
async function detectCIWorkflowSupport(projectRoot) {
  const workflowsDir = path.join(projectRoot, '.github', 'workflows');
  let hasWorkflows = false;
  let workflowCount = 0;
  const workflowTypes = [];

  try {
    if (existsSync(workflowsDir)) {
      const entries = await readdir(workflowsDir);
      const yamlFiles = entries.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      workflowCount = yamlFiles.length;
      hasWorkflows = workflowCount > 0;

      for (const file of yamlFiles) {
        try {
          const content = await readFile(path.join(workflowsDir, file), 'utf8');
          const lowered = content.toLowerCase();
          const hasExplicitTestJob = /^\s{2,}(test|tests|check|checks)\s*:\s*$/gim.test(content);
          const hasTestCommand = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b/i.test(content)
            || /\b(?:pytest|go test|cargo test|dotnet test|ctest)\b/i.test(content);
          const hasTestKeyword = /\btests?\b/i.test(content) || /\btesting\b/i.test(content);
          if (hasExplicitTestJob || hasTestCommand || hasTestKeyword) {
            workflowTypes.push('test');
          }
          if (lowered.includes('lint') || lowered.includes('eslint') || lowered.includes('ruff')) {
            workflowTypes.push('lint');
          }
          if (lowered.includes('build') || lowered.includes('compile')) {
            workflowTypes.push('build');
          }
          if (lowered.includes('deploy') || lowered.includes('release')) {
            workflowTypes.push('deploy');
          }
        } catch {
          // skip unreadable workflow files
        }
      }
    }
  } catch {
    // skip if workflows dir is inaccessible
  }

  return {
    has_workflows: hasWorkflows,
    workflow_count: workflowCount,
    workflow_types: [...new Set(workflowTypes)],
  };
}

/**
 * Recommend setup mode based on spec complexity and CI support.
 * @param {Object} complexity - Result from analyzeSpecComplexity
 * @param {Object} ciSupport - Result from detectCIWorkflowSupport
 * @returns {{ recommended_mode: string, reasoning: string[] }}
 */
function recommendMode(complexity, ciSupport) {
  const reasoning = [];
  let orchestratorScore = 0;

  // Factor 1: Workstream count
  if (complexity.workstream_count >= 3) {
    orchestratorScore += 2;
    reasoning.push(`${complexity.workstream_count} distinct workstreams detected — parallelism would help`);
  } else if (complexity.workstream_count >= 2) {
    orchestratorScore += 1;
    reasoning.push(`${complexity.workstream_count} workstreams found — moderate parallelism potential`);
  } else {
    reasoning.push('Single workstream — loop mode is sufficient');
  }

  // Factor 2: Parallelism signals
  if (complexity.parallelism_score >= 3) {
    orchestratorScore += 2;
    reasoning.push(`Strong parallelism signals (${complexity.parallelism_score} mentions)`);
  } else if (complexity.parallelism_score >= 1) {
    orchestratorScore += 1;
    reasoning.push(`Some parallelism signals (${complexity.parallelism_score} mentions)`);
  }

  // Factor 3: Estimated issue count
  if (complexity.estimated_issue_count >= 10) {
    orchestratorScore += 2;
    reasoning.push(`Large scope (${complexity.estimated_issue_count} estimated issues) — orchestrator helps manage complexity`);
  } else if (complexity.estimated_issue_count >= 5) {
    orchestratorScore += 1;
    reasoning.push(`Medium scope (${complexity.estimated_issue_count} estimated issues)`);
  } else {
    reasoning.push(`Small scope (${complexity.estimated_issue_count} estimated issues) — loop mode is efficient`);
  }

  // Factor 4: CI support
  if (ciSupport.has_workflows && ciSupport.workflow_types.includes('test')) {
    orchestratorScore += 1;
    reasoning.push('CI test workflows detected — orchestrator can leverage automated gates');
  }

  const recommendedMode = orchestratorScore >= 3 ? 'orchestrate' : 'loop';
  if (recommendedMode === 'orchestrate') {
    reasoning.unshift('Recommendation: orchestrator mode (score: ' + orchestratorScore + '/7)');
  } else {
    reasoning.unshift('Recommendation: loop mode (score: ' + orchestratorScore + '/7)');
  }

  return { recommended_mode: recommendedMode, reasoning };
}

async function discoverReferenceCandidates(projectRoot, specCandidates) {
  const ordered = [
    'SPEC.md',
    'README.md',
    'RESEARCH.md',
    'REVIEW_LOG.md',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'docs/architecture.md',
    'docs/design.md',
    'docs/adr',
  ];
  const excluded = new Set(specCandidates);
  const found = [];
  for (const rel of ordered) {
    const normalized = rel.replace(/\\/g, '/');
    if (excluded.has(normalized)) {
      continue;
    }
    if (await fileExists(path.join(projectRoot, rel))) {
      found.push(normalized);
    }
  }
  return found;
}

export function normalizeList(items) {
  if (!items) {
    return [];
  }
  if (typeof items === 'string') {
    return items.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return items
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => typeof item === 'string' && item.length > 0);
}

export function readDefaultProvider(homeDir) {
  const configPath = path.join(homeDir, '.aloop', 'config.yml');
  if (!existsSync(configPath)) {
    return 'claude';
  }
  try {
    const content = readFileSync(configPath, 'utf8');
    const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith('default_provider:'));
    return line?.split(':').slice(1).join(':').trim() || 'claude';
  } catch {
    return 'claude';
  }
}

export const KNOWN_PROVIDERS = ['claude', 'codex', 'gemini', 'copilot', 'opencode'];

export function validateProviders(providerList) {
  const unknown = providerList.filter((p) => !KNOWN_PROVIDERS.includes(p));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown provider(s): ${unknown.join(', ')} (valid: ${KNOWN_PROVIDERS.join(', ')})`
    );
  }
}

export function validateSpecFiles(specFiles, projectRoot) {
  for (const file of specFiles) {
    if (!existsSync(path.resolve(projectRoot, file))) {
      throw new Error(`Spec file not found: ${file}`);
    }
  }
}

export function getInstalledProviders() {
  const providers = ['claude', 'opencode', 'codex', 'gemini', 'copilot'];
  const installed = [];
  const missing = [];
  for (const provider of providers) {
    const status = spawnSync(provider, ['--version'], { stdio: 'ignore' });
    if (status.status === 0 || status.status === 1) {
      installed.push(provider);
    } else {
      missing.push(provider);
    }
  }
  return { installed, missing };
}

/**
 * @param {Object} discovery
 * @throws {Error}
 */
export function assertProjectConfigured(discovery) {
  if (!discovery?.setup?.config_exists) {
    throw new Error('No Aloop configuration found for this project. Run `aloop setup` first.');
  }
}

async function detectDevcontainer(projectRoot) {
  const candidates = [
    path.join(projectRoot, '.devcontainer', 'devcontainer.json'),
    path.join(projectRoot, '.devcontainer.json'),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return { enabled: true, config_path: candidate };
    }
  }
  return { enabled: false, config_path: null };
}

/**
 * @param {Object} options
 * @param {string} [options.projectRoot]
 * @param {string} [options.homeDir]
 * @returns {Promise<DiscoveryResult>}
 */
export async function discoverWorkspace(options = {}) {
  const homeDir = getHomeDir(options.homeDir);
  const projectRoot = resolveProjectRoot(options.projectRoot);
  const projectHash = getProjectHash(projectRoot);
  const projectName = path.basename(projectRoot);
  const { isGitRepo, gitBranch } = detectGit(projectRoot);
  const language = await detectLanguage(projectRoot);
  const validationPresets = await buildValidationPresets(language.language, projectRoot);
  const specCandidates = await discoverSpecCandidates(projectRoot);
  const referenceCandidates = await discoverReferenceCandidates(projectRoot, specCandidates);
  const providers = getInstalledProviders();
  const projectDir = path.join(homeDir, '.aloop', 'projects', projectHash);
  const complexity = await analyzeSpecComplexity(projectRoot, specCandidates);
  const ciSupport = await detectCIWorkflowSupport(projectRoot);
  const modeRecommendation = recommendMode(complexity, ciSupport);
  const devcontainer = await detectDevcontainer(projectRoot);

  return {
    project: {
      root: projectRoot,
      name: projectName,
      hash: projectHash,
      is_git_repo: isGitRepo,
      git_branch: gitBranch,
    },
    setup: {
      project_dir: projectDir,
      config_path: path.join(projectDir, 'config.yml'),
      config_exists: existsSync(path.join(projectDir, 'config.yml')),
      templates_dir: path.join(homeDir, '.aloop', 'templates'),
    },
    context: {
      detected_language: language.language,
      language_confidence: language.confidence,
      language_signals: language.signals,
      validation_presets: validationPresets,
      spec_candidates: specCandidates,
      reference_candidates: referenceCandidates,
      context_files: {
        'TODO.md': existsSync(path.join(projectRoot, 'TODO.md')),
        'RESEARCH.md': existsSync(path.join(projectRoot, 'RESEARCH.md')),
        'REVIEW_LOG.md': existsSync(path.join(projectRoot, 'REVIEW_LOG.md')),
        'STEERING.md': existsSync(path.join(projectRoot, 'STEERING.md')),
      },
    },
    providers: {
      installed: providers.installed,
      missing: providers.missing,
      default_provider: readDefaultProvider(homeDir),
      default_models: {
        claude: 'opus',
        opencode: 'opencode-default',
        codex: 'gpt-5.3-codex',
        gemini: 'gemini-3.1-pro-preview',
        copilot: 'gpt-5.3-codex',
      },
      round_robin_default: ['claude', 'opencode', 'codex', 'gemini', 'copilot'],
    },
    devcontainer,
    spec_complexity: complexity,
    ci_support: ciSupport,
    mode_recommendation: modeRecommendation,
    discovered_at: new Date().toISOString(),
  };
}

function toYamlQuoted(value) {
  if (value === null || value === undefined) return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const AUTONOMY_LEVELS = new Set(['cautious', 'balanced', 'autonomous']);

function normalizeAutonomyLevel(value) {
  if (typeof value !== 'string') {
    return 'balanced';
  }
  const normalized = value.trim().toLowerCase();
  return AUTONOMY_LEVELS.has(normalized) ? normalized : 'balanced';
}

const DATA_PRIVACY_LEVELS = new Set(['private', 'public']);

function normalizeDataPrivacy(value) {
  if (typeof value !== 'string') {
    return 'private';
  }
  const normalized = value.trim().toLowerCase();
  return DATA_PRIVACY_LEVELS.has(normalized) ? normalized : 'private';
}

function templatesExist(directory, requiredTemplates) {
  return existsSync(directory) && requiredTemplates.every((file) => existsSync(path.join(directory, file)));
}

/**
 * @param {string[]} requiredTemplates
 * @param {{moduleDir?: string, argv1?: string, cwd?: string}} [options]
 * @returns {string | null}
 */
export function resolveBundledTemplatesDir(requiredTemplates, options = {}) {
  const moduleDir = path.resolve(options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url)));
  const argv1 = options.argv1 ?? process.argv[1];
  const argvDir = typeof argv1 === 'string' && argv1.length > 0 ? path.dirname(path.resolve(argv1)) : null;
  const cwdDir = path.resolve(options.cwd ?? process.cwd());
  const baseDirs = [moduleDir, argvDir, cwdDir].filter(Boolean);
  const seen = new Set();

  for (const baseDir of baseDirs) {
    for (let depth = 0; depth <= 6; depth++) {
      const up = depth === 0 ? [] : new Array(depth).fill('..');
      const candidate = path.resolve(baseDir, ...up, 'templates');
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (templatesExist(candidate, requiredTemplates)) {
        return candidate;
      }
    }
  }

  return null;
}

const OPENCODE_AGENT_FILES = ['vision-reviewer.md', 'error-analyst.md', 'code-critic.md'];
const LOOP_SCRIPT_FILES = ['loop.sh', 'loop.ps1'];

export function resolveBundledAgentsDir(options = {}) {
  const moduleDir = path.resolve(options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url)));
  const argv1 = options.argv1 ?? process.argv[1];
  const argvDir = typeof argv1 === 'string' && argv1.length > 0 ? path.dirname(path.resolve(argv1)) : null;
  const cwdDir = path.resolve(options.cwd ?? process.cwd());
  const baseDirs = [moduleDir, argvDir, cwdDir].filter(Boolean);
  const seen = new Set();

  for (const baseDir of baseDirs) {
    for (let depth = 0; depth <= 6; depth++) {
      const up = depth === 0 ? [] : new Array(depth).fill('..');
      const candidate = path.resolve(baseDir, ...up, 'agents', 'opencode');
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (agentsExist(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function agentsExist(dir) {
  return OPENCODE_AGENT_FILES.every((f) => existsSync(path.join(dir, f)));
}

function loopScriptsExist(dir) {
  return LOOP_SCRIPT_FILES.every((f) => existsSync(path.join(dir, f)));
}

export function resolveBundledBinDir(options = {}) {
  const moduleDir = path.resolve(options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url)));
  const argv1 = options.argv1 ?? process.argv[1];
  const argvDir = typeof argv1 === 'string' && argv1.length > 0 ? path.dirname(path.resolve(argv1)) : null;
  const cwdDir = path.resolve(options.cwd ?? process.cwd());
  const baseDirs = [moduleDir, argvDir, cwdDir].filter(Boolean);
  const candidateSuffixes = [['bin'], ['aloop', 'bin']];
  const seen = new Set();

  for (const baseDir of baseDirs) {
    for (let depth = 0; depth <= 6; depth++) {
      const up = depth === 0 ? [] : new Array(depth).fill('..');
      for (const suffix of candidateSuffixes) {
        const candidate = path.resolve(baseDir, ...up, ...suffix);
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        if (loopScriptsExist(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

const PROVIDER_HINTS = {
  claude: '- Claude hint: Use parallel subagents when large searches are needed; summarize before coding.',
  opencode: '- OpenCode hint: Use delegated agents for broad repo scans; keep edits in small validated patches.',
  codex: '- Codex hint: Prefer stdin prompt mode and keep outputs concise and action-focused.',
  gemini: '- Gemini hint: Keep prompts explicit and deterministic; re-check assumptions before writing code.',
  copilot: '- Copilot hint: Keep edits surgical and validate with focused checks after changes.',
  'round-robin': '- Round-robin hint: Keep context handoff explicit in TODO.md and REVIEW_LOG.md between providers.',
};

function resolveProviderHints(provider, enabledProviders = []) {
  const orderedProviders = [];
  for (const candidate of normalizeList(enabledProviders)) {
    if (!orderedProviders.includes(candidate)) {
      orderedProviders.push(candidate);
    }
  }
  if (provider && !orderedProviders.includes(provider)) {
    orderedProviders.unshift(provider);
  }

  return orderedProviders
    .map((candidate) => PROVIDER_HINTS[candidate])
    .filter((value) => Boolean(value))
    .join('\n');
}

const LOOP_PROMPT_TEMPLATES = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md', 'PROMPT_spec-gap.md', 'PROMPT_docs.md', 'PROMPT_spec-review.md', 'PROMPT_final-review.md', 'PROMPT_final-qa.md'];
const SINGLE_PROMPT_TEMPLATES = ['PROMPT_single.md'];
const ORCHESTRATOR_PROMPT_TEMPLATES = [
  'PROMPT_orch_scan.md',
  'PROMPT_orch_product_analyst.md',
  'PROMPT_orch_arch_analyst.md',
  'PROMPT_orch_decompose.md',
  'PROMPT_orch_refine.md',
  'PROMPT_orch_sub_decompose.md',
  'PROMPT_orch_planner_frontend.md',
  'PROMPT_orch_planner_backend.md',
  'PROMPT_orch_planner_infra.md',
  'PROMPT_orch_planner_fullstack.md',
  'PROMPT_orch_estimate.md',
  'PROMPT_orch_resolver.md',
  'PROMPT_orch_replan.md',
  'PROMPT_orch_spec_consistency.md',
];

function resolvePromptTemplates(mode) {
  if (mode === 'orchestrate') return ORCHESTRATOR_PROMPT_TEMPLATES;
  if (mode === 'single') return SINGLE_PROMPT_TEMPLATES;
  return LOOP_PROMPT_TEMPLATES;
}

function normalizeScaffoldMode(mode) {
  if (typeof mode !== 'string') {
    return 'plan-build-review';
  }
  const trimmed = mode.trim();
  if (trimmed.length === 0) {
    return 'plan-build-review';
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'loop') {
    return 'plan-build-review';
  }
  if (lowered === 'single') {
    return 'single';
  }
  if (lowered === 'orchestrate') {
    return 'orchestrate';
  }
  return trimmed;
}

const INCLUDE_DIRECTIVE_PATTERN = /\{\{include:([^}]+)\}\}/g;

async function expandTemplateIncludes(content, templatesDir, seenIncludes = []) {
  const directives = [...content.matchAll(INCLUDE_DIRECTIVE_PATTERN)];
  if (directives.length === 0) {
    return content;
  }

  let expanded = content;
  for (const directive of directives) {
    const rawPath = directive[1].trim();
    const includePath = path.resolve(templatesDir, rawPath);
    const relativePath = path.relative(templatesDir, includePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Include path escapes templates directory: ${rawPath}`);
    }
    if (seenIncludes.includes(includePath)) {
      const cycle = [...seenIncludes, includePath].map((entry) => path.relative(templatesDir, entry)).join(' -> ');
      throw new Error(`Circular include detected: ${cycle}`);
    }
    if (!existsSync(includePath)) {
      throw new Error(`Included template not found: ${includePath}`);
    }
    const includeContent = await readFile(includePath, 'utf8');
    const nested = await expandTemplateIncludes(includeContent, templatesDir, [...seenIncludes, includePath]);
    expanded = expanded.replace(directive[0], nested);
  }
  return expanded;
}

/**
 * @param {Object} options
 * @param {string} [options.projectRoot]
 * @param {string} [options.homeDir]
 * @param {string} [options.language]
 * @param {string} [options.provider]
 * @param {string[]} [options.enabledProviders]
 * @param {string[]} [options.roundRobinOrder]
 * @param {string[]} [options.specFiles]
 * @param {string[]} [options.referenceFiles]
 * @param {string[]} [options.validationCommands]
 * @param {string[]} [options.safetyRules]
 * @param {string} [options.mode]
 * @param {'cautious'|'balanced'|'autonomous'} [options.autonomyLevel]
 * @param {'private'|'public'} [options.dataPrivacy]
 * @param {'mount-first'|'env-first'|'env-only'} [options.devcontainerAuthStrategy]
 * @param {string} [options.templatesDir]
 * @param {string} [options.bundledBinDir]
 */
export async function scaffoldWorkspace(options = {}) {
  const discovery = await discoverWorkspace(options);
  const provider = options.provider ?? discovery.providers.default_provider;
  const enabledProviders = normalizeList(options.enabledProviders);
  const enabled = enabledProviders.length > 0 ? enabledProviders : discovery.providers.installed.length > 0 ? discovery.providers.installed : ['claude'];
  const roundRobinOrder = normalizeList(options.roundRobinOrder);
  const roundRobin = roundRobinOrder.length > 0 ? roundRobinOrder : [...enabled];
  const specFiles = normalizeList(options.specFiles);
  const resolvedSpecFiles = specFiles.length > 0 ? specFiles : discovery.context.spec_candidates.slice(0, 1);
  const referenceFiles = normalizeList(options.referenceFiles);
  const resolvedReferenceFiles = referenceFiles.length > 0 ? referenceFiles : discovery.context.reference_candidates;
  const validationCommands = normalizeList(options.validationCommands);
  const resolvedValidation = validationCommands.length > 0 ? validationCommands : discovery.context.validation_presets.full;
  const safetyRules = normalizeList(options.safetyRules);
  const resolvedSafetyRules =
    safetyRules.length > 0 ? safetyRules : ['Never delete the project directory or run destructive commands', 'Never push to remote without explicit user approval'];
  const language = options.language ?? discovery.context.detected_language;
  const mode = normalizeScaffoldMode(options.mode);
  const autonomyLevel = normalizeAutonomyLevel(options.autonomyLevel);
  const dataPrivacy = normalizeDataPrivacy(options.dataPrivacy);
  const adapter = (options.adapter === 'local') ? 'local' : 'github';
  const devcontainerAuthStrategy = options.devcontainerAuthStrategy ?? 'mount-first';
  const templatesDir = path.resolve(options.templatesDir ?? discovery.setup.templates_dir);
  const promptsDir = path.join(discovery.setup.project_dir, 'prompts');

  // Validate explicit inputs before writing any files
  if (enabledProviders.length > 0) {
    validateProviders(enabled);
  }
  if (options.provider) {
    validateProviders([provider]);
  }
  if (specFiles.length > 0) {
    validateSpecFiles(specFiles, discovery.project.root);
  }

  // Bootstrap templates from bundled source if the HOME templates directory doesn't exist yet
  // Only auto-bootstrap when using the default templates path (not an explicit templatesDir option)
  const requiredTemplates = resolvePromptTemplates(mode);
  const templatesMissing = requiredTemplates.some(f => !existsSync(path.join(templatesDir, f)));
  if (templatesMissing && !options.templatesDir) {
    const bundledTemplatesDir = resolveBundledTemplatesDir(requiredTemplates);
    if (bundledTemplatesDir) {
      await mkdir(templatesDir, { recursive: true });
      const entries = await readdir(bundledTemplatesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          await copyFile(path.join(bundledTemplatesDir, entry.name), path.join(templatesDir, entry.name));
        } else if (entry.isDirectory()) {
          // Copy subdirectories (e.g. conventions/)
          const subSrc = path.join(bundledTemplatesDir, entry.name);
          const subDest = path.join(templatesDir, entry.name);
          await mkdir(subDest, { recursive: true });
          const subEntries = await readdir(subSrc);
          for (const subFile of subEntries) {
            const subStat = await stat(path.join(subSrc, subFile));
            if (subStat.isFile()) {
              await copyFile(path.join(subSrc, subFile), path.join(subDest, subFile));
            }
          }
        }
      }
    }
  }

  const loopBinDir = path.join(discovery.setup.templates_dir, '..', 'bin');
  const loopScriptsMissing = LOOP_SCRIPT_FILES.some((file) => !existsSync(path.join(loopBinDir, file)));
  if (loopScriptsMissing) {
    const bundledBinDir = options.bundledBinDir ?? resolveBundledBinDir();
    if (bundledBinDir) {
      await mkdir(loopBinDir, { recursive: true });
      for (const scriptName of LOOP_SCRIPT_FILES) {
        const destination = path.join(loopBinDir, scriptName);
        if (existsSync(destination)) continue;
        const source = path.join(bundledBinDir, scriptName);
        if (!existsSync(source)) continue;
        await copyFile(source, destination);
      }
      const loopShellPath = path.join(loopBinDir, 'loop.sh');
      if (existsSync(loopShellPath)) {
        await chmod(loopShellPath, 0o755);
      }
    }
  }

  for (const file of requiredTemplates) {
    if (!existsSync(path.join(templatesDir, file))) {
      throw new Error(`Template not found: ${path.join(templatesDir, file)}`);
    }
  }

  await mkdir(promptsDir, { recursive: true });

  const configLines = [
    `project_name: ${toYamlQuoted(discovery.project.name)}`,
    `project_root: ${toYamlQuoted(discovery.project.root)}`,
    `language: ${toYamlQuoted(language)}`,
    `provider: ${toYamlQuoted(provider)}`,
    `mode: ${toYamlQuoted(mode)}`,
    `autonomy_level: ${toYamlQuoted(autonomyLevel)}`,
    `data_privacy: ${toYamlQuoted(dataPrivacy)}`,
    `devcontainer_auth_strategy: ${toYamlQuoted(devcontainerAuthStrategy)}`,
    `adapter: ${toYamlQuoted(adapter)}`,
    'spec_files:',
    ...resolvedSpecFiles.map((value) => `  - ${toYamlQuoted(value)}`),
    'reference_files:',
    ...resolvedReferenceFiles.map((value) => `  - ${toYamlQuoted(value)}`),
    'validation_commands: |',
    ...resolvedValidation.map((value) => `  ${value}`),
    'safety_rules: |',
    ...resolvedSafetyRules.map((value) => `  - ${value}`),
    '',
    'enabled_providers:',
    ...enabled.map((value) => `  - ${toYamlQuoted(value)}`),
    '',
    'models:',
    "  claude: 'opus'",
    "  opencode: 'opencode-default'",
    "  codex: 'gpt-5.3-codex'",
    "  gemini: 'gemini-3.1-pro-preview'",
    "  copilot: 'gpt-5.3-codex'",
    '',
    'cost_routing:',
    "  plan: 'prefer_capable'",
    "  build: 'prefer_cheap'",
    "  review: 'prefer_capable'",
    '',
    'round_robin_order:',
    ...roundRobin.map((value) => `  - ${toYamlQuoted(value)}`),
    '',
    'privacy_policy:',
    `  data_classification: ${toYamlQuoted(dataPrivacy)}`,
    `  zdr_enabled: ${dataPrivacy === 'private' ? 'true' : 'false'}`,
    `  require_data_retention_safe: ${dataPrivacy === 'private' ? 'true' : 'false'}`,
    '',
    `created_at: ${toYamlQuoted(new Date().toISOString())}`,
  ];

  await writeFile(discovery.setup.config_path, `${configLines.join('\n')}\n`, 'utf8');

  // Generate default pipeline.yml at <projectRoot>/.aloop/pipeline.yml if it doesn't exist.
  // Without this file, compile-loop-plan produces an empty finalizer array and the
  // finalizer phase is skipped even when all tasks are done.
  const pipelineYmlDir = path.join(discovery.project.root, '.aloop');
  const pipelineYmlPath = path.join(pipelineYmlDir, 'pipeline.yml');
  if (!existsSync(pipelineYmlPath)) {
    await mkdir(pipelineYmlDir, { recursive: true });
    const pipelineContent = [
      '# Continuous cycle — repeats until all tasks done at cycle boundary',
      'pipeline:',
      '  - agent: plan',
      '  - agent: build',
      '    repeat: 5',
      '    onFailure: retry',
      '  - agent: qa',
      '  - agent: review',
      '    onFailure: goto build',
      '',
      '# Completion finalizer — runs once when all tasks done at cycle boundary.',
      '# Processed sequentially. If any agent adds TODOs, finalizer aborts',
      '# (resets to position 0) and the cycle resumes.',
      '# Only the last agent completing with zero new TODOs ends the loop.',
      'finalizer:',
      '  - PROMPT_spec-gap.md',
      '  - PROMPT_docs.md',
      '  - PROMPT_spec-review.md',
      '  - PROMPT_final-review.md',
      '  - PROMPT_final-qa.md',
      '  - PROMPT_proof.md',
      '',
    ].join('\n');
    await writeFile(pipelineYmlPath, pipelineContent, 'utf8');
  }

  const replacements = {
    '{{SPEC_FILES}}': resolvedSpecFiles.join(', '),
    '{{REFERENCE_FILES}}': resolvedReferenceFiles.join(', '),
    '{{VALIDATION_COMMANDS}}': resolvedValidation.map((value) => `- ${value}`).join('\n'),
    '{{SAFETY_RULES}}': resolvedSafetyRules.map((value) => `- ${value}`).join('\n'),
    '{{PROVIDER_HINTS}}': resolveProviderHints(provider, enabled),
  };

  for (const fileName of requiredTemplates) {
    const templatePath = path.join(templatesDir, fileName);
    const destinationPath = path.join(promptsDir, fileName);
    let content = await readFile(templatePath, 'utf8');
    content = await expandTemplateIncludes(content, templatesDir);
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(key, value);
    }
    await writeFile(destinationPath, content, 'utf8');
  }

  // Copy opencode agent files when opencode is configured
  if (enabled.includes('opencode')) {
    const projectRoot = discovery.project.root;
    const opencodeAgentsDir = path.join(projectRoot, '.opencode', 'agents');
    const bundledAgentsDir = resolveBundledAgentsDir();
    if (bundledAgentsDir) {
      await mkdir(opencodeAgentsDir, { recursive: true });
      for (const agentFile of OPENCODE_AGENT_FILES) {
        const src = path.join(bundledAgentsDir, agentFile);
        const dest = path.join(opencodeAgentsDir, agentFile);
        if (existsSync(src)) {
          await copyFile(src, dest);
        }
      }
    }
  }

  return {
    config_path: discovery.setup.config_path,
    prompts_dir: promptsDir,
    project_dir: discovery.setup.project_dir,
    project_hash: discovery.project.hash,
  };
}
