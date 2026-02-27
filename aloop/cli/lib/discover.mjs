import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveHomeDir, resolveWorkspace } from './project.mjs';

function commandExists(name) {
  try {
    const result = spawnSync(name, ['--version'], { stdio: 'ignore' });
    return result.status === 0 || result.status === 1;
  } catch {
    return false;
  }
}

function getInstalledProviders() {
  const providers = ['claude', 'codex', 'gemini', 'copilot'];
  const installed = [];
  const missing = [];

  for (const provider of providers) {
    if (commandExists(provider)) {
      installed.push(provider);
    } else {
      missing.push(provider);
    }
  }

  return { installed, missing };
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
    if (existsSync(path.join(projectRoot, check.rel))) {
      score[check.language] += check.points;
      signals.push(check.rel);
    }
  }

  const rootEntries = await readdir(projectRoot).catch(() => []);
  if (rootEntries.some((entry) => entry.endsWith('.sln'))) {
    score.dotnet += 4;
    signals.push('*.sln');
  }
  const allEntries = await readdir(projectRoot, { recursive: true }).catch(() => []);
  if (allEntries.some((entry) => String(entry).endsWith('.csproj'))) {
    score.dotnet += 4;
    signals.push('*.csproj');
  }

  let language = 'other';
  let points = 0;
  for (const [candidate, candidatePoints] of Object.entries(score)) {
    if (candidatePoints > points) {
      language = candidate;
      points = candidatePoints;
    }
  }

  return {
    language,
    confidence: points >= 5 ? 'high' : points >= 3 ? 'medium' : 'low',
    signals,
  };
}

async function getPackageScripts(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return {};
  }

  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    return pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  } catch {
    return {};
  }
}

async function buildValidationPresets(language, projectRoot) {
  if (language === 'node-typescript') {
    const scripts = await getPackageScripts(projectRoot);
    const test = scripts.test ? 'npm test' : 'npx vitest run';
    const typecheck = scripts.typecheck ? 'npm run typecheck' : (existsSync(path.join(projectRoot, 'tsconfig.json')) ? 'npx tsc --noEmit' : null);
    const lint = scripts.lint ? 'npm run lint' : 'npx eslint .';
    const build = scripts.build ? 'npm run build' : null;
    const testsAndTypes = [typecheck, test].filter(Boolean);
    const full = [typecheck, lint, test, build].filter(Boolean);
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
  const found = ordered.filter((candidate) => existsSync(path.join(projectRoot, candidate))).map((candidate) => candidate.replace(/\\/g, '/'));

  const docsDir = path.join(projectRoot, 'docs');
  if (existsSync(docsDir)) {
    const foundSet = new Set(found);
    const docEntries = await readdir(docsDir).catch(() => []);
    for (const file of docEntries.filter((f) => f.endsWith('.md')).slice(0, 8)) {
      const rel = `docs/${file}`;
      if (!foundSet.has(rel)) {
        found.push(rel);
        foundSet.add(rel);
      }
    }
  }

  return found;
}

function discoverReferenceCandidates(projectRoot, specCandidates) {
  const excluded = new Set(specCandidates);
  const ordered = ['SPEC.md', 'README.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'AGENTS.md', 'CONTRIBUTING.md', 'docs/architecture.md', 'docs/design.md', 'docs/adr'];

  return ordered
    .map((candidate) => candidate.replace(/\\/g, '/'))
    .filter((candidate) => !excluded.has(candidate) && existsSync(path.join(projectRoot, candidate)));
}

async function readGlobalModels(homeDir) {
  const configPath = path.join(homeDir, '.aloop', 'config.yml');
  const defaults = {
    claude: 'opus',
    codex: 'gpt-5.3-codex',
    gemini: 'gemini-3.1-pro-preview',
    copilot: 'gpt-5.3-codex',
  };

  if (!existsSync(configPath)) {
    return defaults;
  }

  const lines = (await readFile(configPath, 'utf8')).split(/\r?\n/);
  let inModels = false;
  for (const line of lines) {
    if (/^models:\s*$/.test(line)) {
      inModels = true;
      continue;
    }

    if (!inModels) {
      continue;
    }

    if (/^\S/.test(line)) {
      break;
    }

    const match = line.match(/^\s{2}([a-z0-9_-]+):\s*([^#]+?)\s*(?:#.*)?$/i);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (key in defaults && value) {
        defaults[key] = value;
      }
    }
  }

  return defaults;
}

async function readRoundRobinDefault(homeDir) {
  const configPath = path.join(homeDir, '.aloop', 'config.yml');
  if (!existsSync(configPath)) {
    return ['claude', 'codex', 'gemini', 'copilot'];
  }

  const lines = (await readFile(configPath, 'utf8')).split(/\r?\n/);
  let inList = false;
  const providers = [];
  for (const line of lines) {
    if (/^round_robin_order:\s*$/.test(line)) {
      inList = true;
      continue;
    }

    if (!inList) {
      continue;
    }

    if (/^\S/.test(line)) {
      break;
    }

    const match = line.match(/^\s*-\s*(.+?)\s*$/);
    if (match) {
      const value = match[1].trim().replace(/^['"]|['"]$/g, '');
      if (value) {
        providers.push(value);
      }
    }
  }

  if (providers.length > 0) {
    return providers;
  }

  return ['claude', 'codex', 'gemini', 'copilot'];
}

function detectGit(projectRoot) {
  const inside = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.status !== 0) {
    return { is_git_repo: false, git_branch: null };
  }

  const branch = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return {
    is_git_repo: true,
    git_branch: branch.status === 0 ? (branch.stdout || '').trim() || null : null,
  };
}

export async function discoverWorkspace(options = {}) {
  const workspace = await resolveWorkspace(options);
  const homeDir = resolveHomeDir(options.homeDir);
  const projectRoot = workspace.project.root;
  const language = await detectLanguage(projectRoot);
  const validation = await buildValidationPresets(language.language, projectRoot);
  const specCandidates = await discoverSpecCandidates(projectRoot);
  const referenceCandidates = discoverReferenceCandidates(projectRoot, specCandidates);
  const providers = getInstalledProviders();
  const defaultModels = await readGlobalModels(homeDir);
  const roundRobinDefault = await readRoundRobinDefault(homeDir);

  return {
    project: {
      ...workspace.project,
      ...detectGit(projectRoot),
    },
    setup: {
      project_dir: workspace.setup.project_dir,
      config_path: workspace.setup.config_path,
      config_exists: workspace.setup.config_exists,
      templates_dir: workspace.setup.templates_dir,
    },
    context: {
      detected_language: language.language,
      language_confidence: language.confidence,
      language_signals: language.signals,
      validation_presets: validation,
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
      default_provider: workspace.setup.default_provider,
      default_models: defaultModels,
      round_robin_default: roundRobinDefault,
    },
    discovered_at: new Date().toISOString(),
  };
}
