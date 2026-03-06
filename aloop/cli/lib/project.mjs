import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

export function getInstalledProviders() {
  const providers = ['claude', 'codex', 'gemini', 'copilot'];
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

export function assertProjectConfigured(discovery) {
  if (!discovery?.setup?.config_exists) {
    throw new Error('No Aloop configuration found for this project. Run `aloop setup` first.');
  }
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
        codex: 'gpt-5.3-codex',
        gemini: 'gemini-3.1-pro-preview',
        copilot: 'gpt-5.3-codex',
      },
      round_robin_default: ['claude', 'codex', 'gemini', 'copilot'],
    },
    discovered_at: new Date().toISOString(),
  };
}

function toYamlQuoted(value) {
  if (value === null || value === undefined) return "''";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function resolveProviderHints(provider) {
  if (provider === 'claude') return '- Claude hint: Use parallel subagents when large searches are needed; summarize before coding.';
  if (provider === 'codex') return '- Codex hint: Prefer stdin prompt mode and keep outputs concise and action-focused.';
  if (provider === 'gemini') return '- Gemini hint: Keep prompts explicit and deterministic; re-check assumptions before writing code.';
  if (provider === 'copilot') return '- Copilot hint: Keep edits surgical and validate with focused checks after changes.';
  if (provider === 'round-robin') return '- Round-robin hint: Keep context handoff explicit in TODO.md and REVIEW_LOG.md between providers.';
  return '';
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
 * @param {string} [options.templatesDir]
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
  const mode = options.mode ?? 'plan-build-review';
  const templatesDir = path.resolve(options.templatesDir ?? discovery.setup.templates_dir);
  const promptsDir = path.join(discovery.setup.project_dir, 'prompts');

  for (const file of ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md']) {
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
    "  codex: 'gpt-5.3-codex'",
    "  gemini: 'gemini-3.1-pro-preview'",
    "  copilot: 'gpt-5.3-codex'",
    '',
    'round_robin_order:',
    ...roundRobin.map((value) => `  - ${toYamlQuoted(value)}`),
    '',
    `created_at: ${toYamlQuoted(new Date().toISOString())}`,
  ];

  await writeFile(discovery.setup.config_path, `${configLines.join('\n')}\n`, 'utf8');

  const replacements = {
    '{{SPEC_FILES}}': resolvedSpecFiles.join(', '),
    '{{REFERENCE_FILES}}': resolvedReferenceFiles.join(', '),
    '{{VALIDATION_COMMANDS}}': resolvedValidation.map((value) => `- ${value}`).join('\n'),
    '{{SAFETY_RULES}}': resolvedSafetyRules.map((value) => `- ${value}`).join('\n'),
    '{{PROVIDER_HINTS}}': resolveProviderHints(provider),
  };

  for (const suffix of ['plan', 'build', 'review', 'steer', 'proof']) {
    const fileName = `PROMPT_${suffix}.md`;
    const templatePath = path.join(templatesDir, fileName);
    const destinationPath = path.join(promptsDir, fileName);
    let content = await readFile(templatePath, 'utf8');
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(key, value);
    }
    await writeFile(destinationPath, content, 'utf8');
  }

  return {
    config_path: discovery.setup.config_path,
    prompts_dir: promptsDir,
    project_dir: discovery.setup.project_dir,
    project_hash: discovery.project.hash,
  };
}
