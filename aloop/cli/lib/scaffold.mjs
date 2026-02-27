import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { discoverWorkspace } from './discover.mjs';

function normalizeList(items = []) {
  return items
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toYamlQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function providerHint(provider) {
  if (provider === 'claude') return '- Claude hint: Use parallel subagents when large searches are needed; summarize before coding.';
  if (provider === 'codex') return '- Codex hint: Prefer stdin prompt mode and keep outputs concise and action-focused.';
  if (provider === 'gemini') return '- Gemini hint: Keep prompts explicit and deterministic; re-check assumptions before writing code.';
  if (provider === 'copilot') return '- Copilot hint: Keep edits surgical and validate with focused checks after changes.';
  if (provider === 'round-robin') return '- Round-robin hint: Keep context handoff explicit in TODO.md and REVIEW_LOG.md between providers.';
  return '';
}

export async function scaffoldWorkspace(options = {}) {
  const discovery = await discoverWorkspace(options);
  const provider = options.provider ?? discovery.providers.default_provider;
  const language = options.language ?? discovery.context.detected_language;
  const mode = options.mode ?? 'plan-build-review';

  const enabledProviders = normalizeList(options.enabledProviders);
  const enabled = enabledProviders.length > 0 ? enabledProviders : (discovery.providers.installed.length > 0 ? discovery.providers.installed : ['claude']);
  const roundRobinInput = normalizeList(options.roundRobinOrder);
  const roundRobinOrder = roundRobinInput.length > 0 ? roundRobinInput : [...enabled];

  const specFilesInput = normalizeList(options.specFiles);
  const specFiles = specFilesInput.length > 0 ? specFilesInput : discovery.context.spec_candidates.slice(0, 1);
  const referenceFilesInput = normalizeList(options.referenceFiles);
  const referenceFiles = referenceFilesInput.length > 0 ? referenceFilesInput : discovery.context.reference_candidates;
  const validationInput = normalizeList(options.validationCommands);
  const validationCommands = validationInput.length > 0 ? validationInput : discovery.context.validation_presets.full;
  const safetyInput = normalizeList(options.safetyRules);
  const safetyRules = safetyInput.length > 0 ? safetyInput : [
    'Never delete the project directory or run destructive commands',
    'Never push to remote without explicit user approval',
  ];

  const templatesDir = path.resolve(options.templatesDir ?? discovery.setup.templates_dir);
  const promptsDir = path.join(discovery.setup.project_dir, 'prompts');
  const configPath = discovery.setup.config_path;

  for (const file of ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md']) {
    const templatePath = path.join(templatesDir, file);
    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
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
    ...specFiles.map((value) => `  - ${toYamlQuoted(value)}`),
    'reference_files:',
    ...referenceFiles.map((value) => `  - ${toYamlQuoted(value)}`),
    'validation_commands: |',
    ...validationCommands.map((value) => `  ${value}`),
    'safety_rules: |',
    ...safetyRules.map((value) => `  - ${value}`),
    '',
    'enabled_providers:',
    ...enabled.map((value) => `  - ${toYamlQuoted(value)}`),
    '',
    'models:',
    `  claude: ${toYamlQuoted(discovery.providers.default_models.claude ?? 'opus')}`,
    `  codex: ${toYamlQuoted(discovery.providers.default_models.codex ?? 'gpt-5.3-codex')}`,
    `  gemini: ${toYamlQuoted(discovery.providers.default_models.gemini ?? 'gemini-3.1-pro-preview')}`,
    `  copilot: ${toYamlQuoted(discovery.providers.default_models.copilot ?? 'gpt-5.3-codex')}`,
    '',
    'round_robin_order:',
    ...roundRobinOrder.map((value) => `  - ${toYamlQuoted(value)}`),
    '',
    `created_at: ${toYamlQuoted(new Date().toISOString())}`,
  ];

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${configLines.join('\n')}\n`, 'utf8');

  const replacements = {
    '{{SPEC_FILES}}': specFiles.join(', '),
    '{{REFERENCE_FILES}}': referenceFiles.join(', '),
    '{{VALIDATION_COMMANDS}}': validationCommands.map((value) => `- ${value}`).join('\n'),
    '{{SAFETY_RULES}}': safetyRules.map((value) => `- ${value}`).join('\n'),
    '{{PROVIDER_HINTS}}': providerHint(provider),
  };

  for (const suffix of ['plan', 'build', 'review', 'steer']) {
    const fileName = `PROMPT_${suffix}.md`;
    const templatePath = path.join(templatesDir, fileName);
    const destinationPath = path.join(promptsDir, fileName);
    let content = await readFile(templatePath, 'utf8');
    for (const [token, replacement] of Object.entries(replacements)) {
      content = content.replaceAll(token, replacement);
    }
    await writeFile(destinationPath, content, 'utf8');
  }

  return {
    config_path: configPath,
    prompts_dir: promptsDir,
    project_dir: discovery.setup.project_dir,
    project_hash: discovery.project.hash,
  };
}
